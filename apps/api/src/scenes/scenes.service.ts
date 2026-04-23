import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSceneDto } from './dto/create-scene.dto';
import { SceneCommandDto } from './dto/scene-command.dto';

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

  private async findOwnedScene(userId: string, sceneId: string) {
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

  async findByProject(
    userId: string,
    projectId: string,
    options?: { includeArchived?: boolean }
  ) {
    await this.ensureOwnedProject(userId, projectId);

    const includeArchived = options?.includeArchived ?? false;

    return this.prisma.scene.findMany({
      where: includeArchived ? { projectId } : { projectId, archivedAt: null },
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(userId: string, sceneId: string) {
    const scene = await this.findOwnedScene(userId, sceneId);
    if (scene.archivedAt) {
      throw new NotFoundException('Scene not found');
    }

    return scene;
  }

  async listCommands(
    userId: string,
    sceneId: string,
    limit = 20,
    filters?: { status?: string; action?: string }
  ) {
    await this.findOwnedScene(userId, sceneId);

    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.trunc(limit)))
      : 20;

    const statusFilter =
      filters?.status === 'succeeded' || filters?.status === 'failed'
        ? filters.status
        : undefined;

    const actionFilter =
      filters?.action === 'rename' ||
      filters?.action === 'archive' ||
      filters?.action === 'restore'
        ? filters.action
        : undefined;

    return this.prisma.sceneCommand.findMany({
      where: {
        sceneId,
        ...(statusFilter ? { status: statusFilter } : {}),
        ...(actionFilter ? { action: actionFilter } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: safeLimit
    });
  }

  async executeCommand(userId: string, sceneId: string, dto: SceneCommandDto) {
    const existing = await this.prisma.sceneCommand.findUnique({
      where: {
        sceneId_commandId: {
          sceneId,
          commandId: dto.commandId
        }
      }
    });

    if (existing) {
      return {
        idempotent: true,
        action: existing.action,
        sceneId,
        result: existing.result
      };
    }

    const scene = await this.findOwnedScene(userId, sceneId);

    if (scene.version !== dto.expectedVersion) {
      throw new ConflictException('Scene version mismatch');
    }

    try {
      const result = await this.executeAction(scene, dto);

      await this.prisma.sceneCommand.create({
        data: {
          sceneId,
          userId,
          commandId: dto.commandId,
          action: dto.action,
          expectedVersion: dto.expectedVersion,
          payload: dto.payload as Prisma.InputJsonValue | undefined,
          result: result as unknown as Prisma.InputJsonValue,
          status: 'succeeded'
        }
      });

      return {
        idempotent: false,
        action: dto.action,
        sceneId,
        result
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown scene command failure';
      const statusCode =
        error instanceof HttpException ? error.getStatus() : 500;

      await this.prisma.sceneCommand.create({
        data: {
          sceneId,
          userId,
          commandId: dto.commandId,
          action: dto.action,
          expectedVersion: dto.expectedVersion,
          payload: dto.payload as Prisma.InputJsonValue | undefined,
          result: {
            error: message,
            statusCode
          } as Prisma.InputJsonValue,
          status: 'failed'
        }
      });

      throw error;
    }
  }

  private async executeAction(scene: { id: string; name: string; version: number; archivedAt: Date | null }, dto: SceneCommandDto) {
    if (dto.action === 'rename') {
      const name = dto.payload?.name?.trim();
      if (!name || name.length < 2 || name.length > 100) {
        throw new BadRequestException('payload.name must be 2~100 chars');
      }

      const updated = await this.prisma.scene.update({
        where: { id: scene.id },
        data: {
          name,
          version: { increment: 1 }
        }
      });

      return {
        sceneId: updated.id,
        name: updated.name,
        version: updated.version,
        archivedAt: updated.archivedAt
      };
    }

    if (dto.action === 'archive') {
      if (scene.archivedAt) {
        return {
          sceneId: scene.id,
          name: scene.name,
          version: scene.version,
          archivedAt: scene.archivedAt
        };
      }

      const updated = await this.prisma.scene.update({
        where: { id: scene.id },
        data: {
          archivedAt: new Date(),
          version: { increment: 1 }
        }
      });

      return {
        sceneId: updated.id,
        name: updated.name,
        version: updated.version,
        archivedAt: updated.archivedAt
      };
    }

    if (dto.action === 'restore') {
      if (!scene.archivedAt) {
        return {
          sceneId: scene.id,
          name: scene.name,
          version: scene.version,
          archivedAt: scene.archivedAt
        };
      }

      const updated = await this.prisma.scene.update({
        where: { id: scene.id },
        data: {
          archivedAt: null,
          version: { increment: 1 }
        }
      });

      return {
        sceneId: updated.id,
        name: updated.name,
        version: updated.version,
        archivedAt: updated.archivedAt
      };
    }

    throw new BadRequestException('Unsupported scene command');
  }
}
