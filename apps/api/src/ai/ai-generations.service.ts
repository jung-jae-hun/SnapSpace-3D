import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { GenerationQuality, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAiGenerationDto, GenerationQualityDto } from './dto/create-ai-generation.dto';

@Injectable()
export class AiGenerationsService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly dailyLimit = Number(process.env.AI_GENERATION_DAILY_LIMIT ?? '20');
  private readonly dedupeWindowMs = Number(process.env.AI_GENERATION_DEDUPE_WINDOW_MS ?? '600000');

  private async ensureOwnedProject(userId: string, projectId: string) {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, userId }
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  private async ensureOwnedScene(userId: string, sceneId: string) {
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

  async create(userId: string, dto: CreateAiGenerationDto) {
    if (!dto.sourceImageAssetId?.trim()) {
      throw new BadRequestException('sourceImageAssetId is required');
    }

    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);

    const todayCount = await this.prisma.aiGenerationJob.count({
      where: {
        userId,
        createdAt: {
          gte: dayStart
        }
      }
    });

    if (todayCount >= this.dailyLimit) {
      throw new HttpException(
        `Daily AI generation limit exceeded (${this.dailyLimit}/day)`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    const scene = await this.ensureOwnedScene(userId, dto.sceneId);
    await this.ensureOwnedProject(userId, scene.projectId);

    const quality: GenerationQuality =
      dto.quality === GenerationQualityDto.low ? 'low' : 'standard';

    const dedupeFrom = new Date(Date.now() - this.dedupeWindowMs);
    const existingRecentJob = await this.prisma.aiGenerationJob.findFirst({
      where: {
        userId,
        sceneId: scene.id,
        sourceImageAssetId: dto.sourceImageAssetId,
        createdAt: {
          gte: dedupeFrom
        },
        status: {
          in: ['queued', 'running', 'post_processing', 'ready']
        }
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        generatedAsset: {
          include: {
            footprint2d: true
          }
        }
      }
    });

    if (existingRecentJob) {
      return existingRecentJob;
    }

    return this.prisma.aiGenerationJob.create({
      data: {
        userId,
        projectId: scene.projectId,
        sceneId: scene.id,
        provider: 'meshy',
        status: 'queued',
        sourceImageAssetId: dto.sourceImageAssetId,
        prompt: dto.prompt,
        quality,
        progress: 0
      }
    });
  }

  async findOne(userId: string, generationId: string) {
    const job = await this.prisma.aiGenerationJob.findFirst({
      where: {
        id: generationId,
        userId
      },
      include: {
        generatedAsset: {
          include: {
            footprint2d: true
          }
        }
      }
    });

    if (!job) {
      throw new NotFoundException('Generation job not found');
    }

    return job;
  }

  async getMetricsSummary(userId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [statusGroups, completedDurations, failedGroups] = await Promise.all([
      this.prisma.aiGenerationJob.groupBy({
        by: ['status'],
        where: {
          userId,
          createdAt: {
            gte: since
          }
        },
        _count: {
          _all: true
        }
      }),
      this.prisma.aiGenerationJob.findMany({
        where: {
          userId,
          status: 'ready',
          createdAt: {
            gte: since
          }
        },
        select: {
          createdAt: true,
          updatedAt: true
        }
      }),
      this.prisma.aiGenerationJob.groupBy({
        by: ['errorCode'],
        where: {
          userId,
          status: 'failed',
          createdAt: {
            gte: since
          }
        },
        _count: {
          _all: true
        }
      })
    ]);

    const total = statusGroups.reduce((sum, item) => sum + item._count._all, 0);
    const successCount = statusGroups.find((item) => item.status === 'ready')?._count._all ?? 0;
    const failedCount = statusGroups.find((item) => item.status === 'failed')?._count._all ?? 0;

    const avgDurationMs =
      completedDurations.length > 0
        ? Math.round(
            completedDurations.reduce(
              (sum, row) => sum + (row.updatedAt.getTime() - row.createdAt.getTime()),
              0
            ) / completedDurations.length
          )
        : null;

    return {
      timeWindow: '24h',
      total,
      successCount,
      failedCount,
      successRate: total > 0 ? Number((successCount / total).toFixed(4)) : 0,
      avgDurationMs,
      byStatus: statusGroups.map((item) => ({
        status: item.status,
        count: item._count._all
      })),
      failureCodes: failedGroups
        .map((item) => ({
          errorCode: item.errorCode ?? 'unknown',
          count: item._count._all
        }))
        .sort((a, b) => b.count - a.count)
    };
  }

  async promoteToObjectDefinition(userId: string, generationId: string) {
    const job = await this.prisma.aiGenerationJob.findFirst({
      where: {
        id: generationId,
        userId
      },
      include: {
        generatedAsset: {
          include: {
            footprint2d: true
          }
        }
      }
    });

    if (!job) {
      throw new NotFoundException('Generation job not found');
    }

    if (job.status !== 'ready' || !job.generatedAsset) {
      throw new NotFoundException('Generation asset is not ready');
    }

    const existing = await this.prisma.objectDefinition.findFirst({
      where: {
        source: 'ai',
        sourceGenerationAssetId: job.generatedAsset.id
      }
    });

    if (existing) {
      return existing;
    }

    const safeCode = `ai_${job.id.slice(0, 12)}`;

    return this.prisma.objectDefinition.create({
      data: {
        code: safeCode,
        name: `AI Object ${job.id.slice(0, 6)}`,
        category: 'ai-generated',
        tags: ['ai', 'generated'],
        modelAssetId: job.generatedAsset.glbAssetId,
        thumbnailAssetId: job.generatedAsset.previewImageAssetId ?? undefined,
        defaultSize: (job.generatedAsset.boundsJson ?? {}) as Prisma.InputJsonValue,
        pivot: job.generatedAsset.pivotMode,
        allowedRotations: [0, 90, 180, 270],
        sockets: {},
        placementRules: {},
        scalable: { x: true, y: true, z: true },
        source: 'ai',
        sourceGenerationAssetId: job.generatedAsset.id
      }
    });
  }
}
