import { NotFoundException } from '@nestjs/common';
import { ScenesService } from './scenes.service';

type MockPrisma = {
  project: {
    findFirst: jest.Mock;
  };
  scene: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

describe('ScenesService', () => {
  let service: ScenesService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      project: {
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1', userId: 'u-1' })
      },
      scene: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 's-1', ...data })),
        findMany: jest.fn().mockResolvedValue([{ id: 's-1', projectId: 'p-1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 's-1', projectId: 'p-1' })
      }
    };

    service = new ScenesService(prisma as never);
  });

  it('create는 소유한 project에서만 scene을 생성한다', async () => {
    const result = await service.create('u-1', 'p-1', { name: 'Scene A' });

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', userId: 'u-1' }
    });
    expect(prisma.scene.create).toHaveBeenCalledWith({
      data: {
        projectId: 'p-1',
        name: 'Scene A',
        version: 1
      }
    });
    expect(result.id).toBe('s-1');
  });

  it('create는 타 사용자 project 접근 시 NotFoundException을 던진다', async () => {
    prisma.project.findFirst.mockResolvedValueOnce(null);

    await expect(service.create('u-1', 'p-foreign', { name: 'Scene A' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('findByProject는 소유권 확인 후 목록을 조회한다', async () => {
    await service.findByProject('u-1', 'p-1');

    expect(prisma.project.findFirst).toHaveBeenCalledWith({
      where: { id: 'p-1', userId: 'u-1' }
    });
    expect(prisma.scene.findMany).toHaveBeenCalledWith({
      where: { projectId: 'p-1' },
      orderBy: { createdAt: 'desc' }
    });
  });

  it('findOne은 소유한 scene이 아니면 NotFoundException을 던진다', async () => {
    prisma.scene.findFirst.mockResolvedValueOnce(null);

    await expect(service.findOne('u-1', 's-foreign')).rejects.toBeInstanceOf(NotFoundException);
  });
});
