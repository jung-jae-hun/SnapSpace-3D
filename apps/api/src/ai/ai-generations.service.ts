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

  private readonly providerMode = (process.env.AI_PROVIDER_MODE ?? 'mock').toLowerCase();
  private readonly dailyLimit = Number(process.env.AI_GENERATION_DAILY_LIMIT ?? '20');
  private readonly monthlyLimit = Number(process.env.AI_GENERATION_MONTHLY_LIMIT ?? '200');
  private readonly providerDailyLimits = this.parseProviderDailyLimits(
    process.env.AI_GENERATION_PROVIDER_DAILY_LIMIT
  );
  private readonly dedupeWindowMs = Number(process.env.AI_GENERATION_DEDUPE_WINDOW_MS ?? '600000');

  private parseProviderDailyLimits(raw?: string) {
    const limits = new Map<string, number>();
    if (!raw?.trim()) {
      return limits;
    }

    for (const token of raw.split(',')) {
      const [mode, value] = token.split(':').map((part) => part.trim().toLowerCase());
      if (!mode || !value) {
        continue;
      }

      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        limits.set(mode, parsed);
      }
    }

    return limits;
  }

  private getProviderName() {
    if (this.providerMode === 'local') {
      return 'local';
    }
    if (this.providerMode === 'opensrc') {
      return 'opensrc';
    }
    if (this.providerMode === 'meshy') {
      return 'meshy';
    }
    return 'mock';
  }

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

    const monthStart = new Date(dayStart);
    monthStart.setDate(1);

    const provider = this.getProviderName();
    const providerDailyLimit = this.providerDailyLimits.get(provider);

    const [todayCount, monthCount, providerTodayCount] = await Promise.all([
      this.prisma.aiGenerationJob.count({
        where: {
          userId,
          createdAt: {
            gte: dayStart
          }
        }
      }),
      this.prisma.aiGenerationJob.count({
        where: {
          userId,
          createdAt: {
            gte: monthStart
          }
        }
      }),
      providerDailyLimit
        ? this.prisma.aiGenerationJob.count({
            where: {
              userId,
              provider,
              createdAt: {
                gte: dayStart
              }
            }
          })
        : Promise.resolve(0)
    ]);

    if (todayCount >= this.dailyLimit) {
      throw new HttpException(
        `Daily AI generation limit exceeded (${this.dailyLimit}/day)`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (monthCount >= this.monthlyLimit) {
      throw new HttpException(
        `Monthly AI generation limit exceeded (${this.monthlyLimit}/month)`,
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (providerDailyLimit && providerTodayCount >= providerDailyLimit) {
      throw new HttpException(
        `Daily AI generation limit exceeded for provider '${provider}' (${providerDailyLimit}/day)`,
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
        provider,
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

  async cancel(userId: string, generationId: string) {
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

    if (job.status === 'ready') {
      throw new BadRequestException('Generation already completed');
    }

    if (job.status === 'failed' && job.errorCode === 'cancelled_by_user') {
      return job;
    }

    if (job.status === 'failed') {
      throw new BadRequestException('Generation already failed');
    }

    const canceled = await this.prisma.aiGenerationJob.update({
      where: { id: generationId },
      data: {
        status: 'failed',
        progress: 0,
        errorCode: 'cancelled_by_user',
        errorMessage: 'Cancelled by user'
      },
      include: {
        generatedAsset: {
          include: {
            footprint2d: true
          }
        }
      }
    });

    return canceled;
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
        tags: [
          'ai',
          'generated',
          'lifecycle:active',
          'lifecycle:version:1',
          `lifecycle:family:${job.generatedAsset.id}`
        ],
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
