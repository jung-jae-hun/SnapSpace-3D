import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSceneDto } from './dto/create-scene.dto';

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureOwnedProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async create(userId: string, projectId: string, dto: CreateSceneDto) {
    await this.ensureOwnedProject(userId, projectId);

    return this.prisma.scene.create({
      data: {
        projectId,
        name: dto.name,
        version: dto.version ?? 1
      }
    });
  }

  async findByProject(userId: string, projectId: string) {
    await this.ensureOwnedProject(userId, projectId);

    return this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(userId: string, sceneId: string) {
    const scene = await this.prisma.scene.findFirst({
      where: {
        id: sceneId,
        project: { userId }
      }
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }
    return scene;
  }
}
