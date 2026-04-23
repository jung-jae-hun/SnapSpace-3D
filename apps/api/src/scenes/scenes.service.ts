import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSceneDto } from './dto/create-scene.dto';

@Injectable()
export class ScenesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(projectId: string, dto: CreateSceneDto) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.scene.create({
      data: {
        projectId,
        name: dto.name,
        version: dto.version ?? 1
      }
    });
  }

  findByProject(projectId: string) {
    return this.prisma.scene.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(sceneId: string) {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) {
      throw new NotFoundException('Scene not found');
    }
    return scene;
  }
}
