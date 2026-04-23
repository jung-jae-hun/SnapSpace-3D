import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ProjectsController } from '../projects/projects.controller';
import { ProjectsService } from '../projects/projects.service';
import { ScenesController } from '../scenes/scenes.controller';
import { ScenesService } from '../scenes/scenes.service';

describe('Guard-protected routes', () => {
  let app: INestApplication;
  let jwtService: { verifyAsync: jest.Mock };

  const projectsServiceMock = {
    createForUser: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Project 1' }),
    findByOwner: jest.fn().mockResolvedValue([]),
    findOneForUser: jest.fn().mockResolvedValue({ id: 'p-1', name: 'Project 1' })
  };

  const scenesServiceMock = {
    create: jest.fn().mockResolvedValue({ id: 's-1', name: 'Scene 1' }),
    findByProject: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue({ id: 's-1', name: 'Scene 1' })
  };

  beforeEach(async () => {
    jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({
        sub: 'u-1',
        email: 'user@test.com',
        tokenType: 'access',
        tokenVersion: 0
      })
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProjectsController, ScenesController],
      providers: [
        JwtAuthGuard,
        { provide: JwtService, useValue: jwtService },
        { provide: ProjectsService, useValue: projectsServiceMock },
        { provide: ScenesService, useValue: scenesServiceMock }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    jest.clearAllMocks();
  });

  it('토큰 없이 GET /projects 요청 시 401', async () => {
    await request(app.getHttpServer()).get('/projects').expect(401);
  });

  it('유효 토큰으로 GET /projects 요청 시 200', async () => {
    await request(app.getHttpServer())
      .get('/projects')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid-token', {
      secret: process.env.JWT_SECRET ?? 'change-me'
    });
    expect(projectsServiceMock.findByOwner).toHaveBeenCalledWith('u-1');
  });

  it('토큰 없이 GET /projects/:projectId/scenes 요청 시 401', async () => {
    await request(app.getHttpServer()).get('/projects/p-1/scenes').expect(401);
  });

  it('유효 토큰으로 GET /projects/:projectId/scenes 요청 시 200', async () => {
    await request(app.getHttpServer())
      .get('/projects/p-1/scenes')
      .set('Authorization', 'Bearer valid-token')
      .expect(200);

    expect(scenesServiceMock.findByProject).toHaveBeenCalledWith('u-1', 'p-1', {
      includeArchived: false
    });
  });
});
