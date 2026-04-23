import { ConflictException, NotFoundException } from '@nestjs/common';
import { ScenesService } from './scenes.service';

type MockPrisma = {
  project: {
    findFirst: jest.Mock;
  };
  scene: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  sceneCommand: {
    findUnique: jest.Mock;
    create: jest.Mock;
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
        findFirst: jest.fn().mockResolvedValue({
          id: 's-1',
          projectId: 'p-1',
          name: 'Scene A',
          version: 1,
          archivedAt: null
        }),
        update: jest.fn().mockImplementation(async ({ where, data }) => ({
          id: where.id,
          name: data.name ?? 'Scene A',
          version:
            typeof data.version === 'object' && data.version.increment ? 2 : 1,
          archivedAt: data.archivedAt ?? null
        }))
      },
      sceneCommand: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'cmd-log-1' })
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
      where: { projectId: 'p-1', archivedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  });

  it('findByProject는 includeArchived=true면 아카이브를 포함해서 조회한다', async () => {
    await service.findByProject('u-1', 'p-1', { includeArchived: true });

    expect(prisma.scene.findMany).toHaveBeenCalledWith({
      where: { projectId: 'p-1' },
      orderBy: { createdAt: 'desc' }
    });
  });

  it('findOne은 소유한 scene이 아니면 NotFoundException을 던진다', async () => {
    prisma.scene.findFirst.mockResolvedValueOnce(null);

    await expect(service.findOne('u-1', 's-foreign')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('executeCommand(rename)는 버전을 증가시키고 커맨드 로그를 저장한다', async () => {
    const result = await service.executeCommand('u-1', 's-1', {
      commandId: 'cmd-1',
      action: 'rename',
      expectedVersion: 1,
      payload: { name: 'Scene A v2' }
    });

    expect(prisma.scene.update).toHaveBeenCalled();
    expect(prisma.sceneCommand.create).toHaveBeenCalled();
    expect(result.idempotent).toBe(false);
    expect((result.result as { version: number }).version).toBe(2);
  });

  it('executeCommand는 동일 commandId 재요청 시 idempotent 응답을 반환한다', async () => {
    prisma.sceneCommand.findUnique.mockResolvedValueOnce({
      action: 'rename',
      result: { sceneId: 's-1', version: 2 }
    });

    const result = await service.executeCommand('u-1', 's-1', {
      commandId: 'cmd-1',
      action: 'rename',
      expectedVersion: 1,
      payload: { name: 'Scene A v2' }
    });

    expect(result.idempotent).toBe(true);
    expect(prisma.scene.update).not.toHaveBeenCalled();
  });

  it('executeCommand는 expectedVersion 불일치 시 ConflictException을 던진다', async () => {
    await expect(
      service.executeCommand('u-1', 's-1', {
        commandId: 'cmd-2',
        action: 'archive',
        expectedVersion: 99
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
