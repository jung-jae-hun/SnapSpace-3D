import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(userId: string, dto: CreateProjectDto) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return this.prisma.project.create({
      data: {
        userId: user.id,
        name: dto.name,
        description: dto.description
      }
    });
  }

  async findByOwner(userId: string) {
    return this.prisma.project.findMany({
      where: {
        userId
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOneForUser(projectId: string, userId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId }
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }
}
