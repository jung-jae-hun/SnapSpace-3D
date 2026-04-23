import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProjectDto) {
    const user = await this.prisma.user.upsert({
      where: { email: dto.ownerEmail },
      update: {},
      create: { email: dto.ownerEmail }
    });

    return this.prisma.project.create({
      data: {
        userId: user.id,
        name: dto.name,
        description: dto.description
      }
    });
  }

  async findByOwnerEmail(ownerEmail: string) {
    return this.prisma.project.findMany({
      where: {
        user: { email: ownerEmail }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }
}
