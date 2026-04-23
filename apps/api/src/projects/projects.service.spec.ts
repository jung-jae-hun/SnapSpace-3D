import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ProjectsService } from './projects.service';

type MockPrisma = {
  user: {
    findUnique: jest.Mock;
  };
  project: {
    create: jest.Mock;
    findMany: jest.Mock;
    findFirst: jest.Mock;
  };
};

describe('ProjectsService', () => {
  let service: ProjectsService;
  let prisma: MockPrisma;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'u-1', email: 'user@test.com' })
      },
      project: {
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'p-1', ...data })),
        findMany: jest.fn().mockResolvedValue([{ id: 'p-1', userId: 'u-1' }]),
        findFirst: jest.fn().mockResolvedValue({ id: 'p-1', userId: 'u-1' })
      }
    };

    service = new ProjectsService(prisma as never);
  });

  it('createForUser는 userId로 프로젝트를 생성한다', async () => {
    const result = await service.createForUser('u-1', {
      name: 'Project 1',
      description: 'Desc'
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u-1' } });
    expect(prisma.project.create).toHaveBeenCalledWith({
      data: {
        userId: 'u-1',
        name: 'Project 1',
        description: 'Desc'
      }
    });
    expect(result.id).toBe('p-1');
  });

  it('createForUser는 사용자가 없으면 UnauthorizedException을 던진다', async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);

    await expect(
      service.createForUser('missing-user', {
        name: 'Project 1'
      })
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('findByOwner는 userId 조건으로 목록을 조회한다', async () => {
    await service.findByOwner('u-1');

    expect(prisma.project.findMany).toHaveBeenCalledWith({
      where: { userId: 'u-1' },
      orderBy: { createdAt: 'desc' }
    });
  });

  it('findOneForUser는 타 사용자 프로젝트 접근 시 NotFoundException을 던진다', async () => {
    prisma.project.findFirst.mockResolvedValueOnce(null);

    await expect(service.findOneForUser('p-foreign', 'u-1')).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
