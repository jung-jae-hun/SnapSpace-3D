import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PlacedObjectsService } from './placed-objects.service';

type MockPrisma = {
  scene: {
    findUnique: jest.Mock;
  };
  placedObject: {
    deleteMany: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    upsert: jest.Mock;
  };
  $transaction: jest.Mock;
};

const makeItem = (id?: string) => ({
  id,
  objectDefinitionId: 'obj-def-1',
  name: 'chair',
  position: { x: 1, y: 0, z: 2 },
  rotationY: 0,
  scale: { x: 1, y: 1, z: 1 }
});

describe('PlacedObjectsService.bulkUpsert', () => {
  let service: PlacedObjectsService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      scene: {
        findUnique: jest.fn().mockResolvedValue({ id: 'scene-1' })
      },
      placedObject: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([{ id: 'p-1' }]),
        create: jest.fn().mockImplementation(async ({ data }) => ({
          id: data.id ?? 'new-id',
          ...data
        })),
        upsert: jest.fn().mockImplementation(async ({ create, update, where }) => ({
          id: where.id,
          ...create,
          ...update
        }))
      },
      $transaction: jest.fn(async (ops: Array<Promise<unknown>>) => Promise.all(ops))
    };

    service = new PlacedObjectsService(prisma as never);
  });

  it('replace 모드에서 기존 항목 삭제 후 재생성한다', async () => {
    const result = await service.bulkUpsert('scene-1', {
      mode: 'replace',
      items: [makeItem('p-1'), makeItem('p-2')]
    });

    expect(prisma.placedObject.deleteMany).toHaveBeenCalledWith({ where: { sceneId: 'scene-1' } });
    expect(prisma.placedObject.create).toHaveBeenCalledTimes(2);
    expect(prisma.placedObject.upsert).not.toHaveBeenCalled();
    expect(result).toEqual({ count: 2, mode: 'replace' });
  });

  it('upsert 모드에서 id가 있으면 upsert, 없으면 create 한다', async () => {
    const result = await service.bulkUpsert('scene-1', {
      mode: 'upsert',
      items: [makeItem('p-1'), makeItem()]
    });

    expect(prisma.placedObject.deleteMany).not.toHaveBeenCalled();
    expect(prisma.placedObject.upsert).toHaveBeenCalledTimes(1);
    expect(prisma.placedObject.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ count: 2, mode: 'upsert' });
  });

  it('upsert 모드에서 다른 scene id가 포함되면 NotFoundException을 던진다', async () => {
    prisma.placedObject.findMany.mockResolvedValueOnce([]);

    await expect(
      service.bulkUpsert('scene-1', {
        mode: 'upsert',
        items: [makeItem('foreign-id')]
      })
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.placedObject.upsert).not.toHaveBeenCalled();
    expect(prisma.placedObject.create).not.toHaveBeenCalled();
  });

  it('upsert 모드에서 요청 내 id가 중복되면 BadRequestException을 던진다', async () => {
    await expect(
      service.bulkUpsert('scene-1', {
        mode: 'upsert',
        items: [makeItem('dup-id'), makeItem('dup-id')]
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.placedObject.findMany).not.toHaveBeenCalled();
    expect(prisma.placedObject.upsert).not.toHaveBeenCalled();
    expect(prisma.placedObject.create).not.toHaveBeenCalled();
  });

  it('존재하지 않는 scene이면 NotFoundException을 던진다', async () => {
    prisma.scene.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.bulkUpsert('missing-scene', {
        mode: 'replace',
        items: []
      })
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
