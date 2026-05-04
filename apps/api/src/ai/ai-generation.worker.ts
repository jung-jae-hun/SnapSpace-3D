import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, type AiGenerationJob } from '@prisma/client';
import IORedis from 'ioredis';
import { AssetsService } from '../assets/assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderClient, type ProviderPollResult } from './ai-provider.client';

@Injectable()
export class AiGenerationWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiGenerationWorker.name);
  private readonly enabled = process.env.AI_GENERATION_WORKER_ENABLED !== 'false';
  private readonly pollMs = Number(process.env.AI_GENERATION_WORKER_POLL_MS ?? '3000');
  private readonly timeoutMs = Number(process.env.AI_GENERATION_TIMEOUT_MS ?? '600000');
  private readonly maxBatch = Number(process.env.AI_GENERATION_WORKER_BATCH ?? '5');
  private readonly providerJobCacheTtlSec = Number(
    process.env.AI_GENERATION_PROVIDER_JOB_CACHE_TTL_SEC ?? `${24 * 60 * 60}`
  );
  private readonly qualityGateMaxDimension = Number(
    process.env.AI_QUALITY_GATE_MAX_DIMENSION ?? '50'
  );

  private timer: NodeJS.Timeout | null = null;
  private isTicking = false;
  private readonly providerJobByLocalJob = new Map<string, string>();
  private readonly redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly providerClient: AiProviderClient,
    private readonly assetsService: AssetsService
  ) {}

  onModuleInit() {
    if (!this.enabled) {
      this.logger.log('AI generation worker disabled by env');
      return;
    }

    this.timer = setInterval(() => {
      void this.tick();
    }, this.pollMs);

    void this.tick();
    this.logger.log(`AI generation worker started (poll=${this.pollMs}ms)`);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    this.redis.disconnect();
  }

  private providerJobCacheKey(localJobId: string) {
    return `snapspace:ai-provider-job:${localJobId}`;
  }

  private async getProviderJobId(localJobId: string) {
    const inMemory = this.providerJobByLocalJob.get(localJobId);
    if (inMemory) {
      return inMemory;
    }

    try {
      const cached = await this.redis.get(this.providerJobCacheKey(localJobId));
      if (cached) {
        this.providerJobByLocalJob.set(localJobId, cached);
        return cached;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`provider job id cache read failed: ${message}`);
    }

    return undefined;
  }

  private async setProviderJobId(localJobId: string, providerJobId: string) {
    this.providerJobByLocalJob.set(localJobId, providerJobId);

    try {
      await this.redis.set(
        this.providerJobCacheKey(localJobId),
        providerJobId,
        'EX',
        this.providerJobCacheTtlSec
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`provider job id cache write failed: ${message}`);
    }
  }

  private async clearProviderJobId(localJobId: string) {
    this.providerJobByLocalJob.delete(localJobId);

    try {
      await this.redis.del(this.providerJobCacheKey(localJobId));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`provider job id cache delete failed: ${message}`);
    }
  }

  private isFinitePositive(value: number) {
    return Number.isFinite(value) && value > 0;
  }

  private validateQualityGates(input: {
    dims: { x: number; y: number; z: number };
    footprintPoints: Array<{ x: number; z: number }>;
    glbAssetId?: string;
    previewImageAssetId?: string;
  }) {
    const { dims, footprintPoints, glbAssetId, previewImageAssetId } = input;

    // Gate 1: bounds sanity check
    const boundValues = [dims.x, dims.y, dims.z];
    if (
      boundValues.some(
        (value) => !this.isFinitePositive(value) || value > this.qualityGateMaxDimension
      )
    ) {
      throw new Error(
        `quality_gate_failed: invalid_bounds (${dims.x}, ${dims.y}, ${dims.z})`
      );
    }

    // Gate 2: footprint integrity check
    if (!Array.isArray(footprintPoints) || footprintPoints.length < 4) {
      throw new Error('quality_gate_failed: invalid_footprint_points');
    }
    for (const point of footprintPoints) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.z)) {
        throw new Error('quality_gate_failed: invalid_footprint_coordinates');
      }
    }

    // Gate 3: preview/glb asset presence check
    if (!glbAssetId?.trim()) {
      throw new Error('quality_gate_failed: missing_glb_asset');
    }
    if (!previewImageAssetId?.trim()) {
      throw new Error('quality_gate_failed: missing_preview_asset');
    }
  }

  private async tick() {
    if (this.isTicking) {
      return;
    }

    this.isTicking = true;

    try {
      await this.failTimedOutJobs();
      await this.moveQueuedToRunning();
      await this.pollActiveJobs();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Worker tick failed: ${message}`);
    } finally {
      this.isTicking = false;
    }
  }

  private async failTimedOutJobs() {
    const threshold = new Date(Date.now() - this.timeoutMs);

    const result = await this.prisma.aiGenerationJob.updateMany({
      where: {
        status: {
          in: ['queued', 'running', 'post_processing']
        },
        createdAt: {
          lte: threshold
        }
      },
      data: {
        status: 'failed',
        errorCode: 'timeout',
        errorMessage: 'Generation timed out',
        progress: 0
      }
    });

    if (result.count > 0) {
      this.logger.warn(`Timed out AI jobs marked as failed: ${result.count}`);
    }
  }

  private async moveQueuedToRunning() {
    const queuedJobs = await this.prisma.aiGenerationJob.findMany({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: this.maxBatch,
      select: {
        id: true,
        sourceImageAssetId: true,
        prompt: true,
        quality: true
      }
    });

    if (queuedJobs.length === 0) {
      return;
    }

    for (const job of queuedJobs) {
      try {
        const started = await this.providerClient.startGeneration({
          localJobId: job.id,
          sourceImageAssetId: job.sourceImageAssetId,
          prompt: job.prompt,
          quality: job.quality
        });

        await this.setProviderJobId(job.id, started.providerJobId);

        await this.prisma.aiGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'running',
            progress: 10,
            errorCode: null,
            errorMessage: null
          }
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.aiGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            progress: 0,
            errorCode: 'provider_start_failed',
            errorMessage: message
          }
        });
      }
    }
  }

  private async pollActiveJobs() {
    const activeJobs = await this.prisma.aiGenerationJob.findMany({
      where: {
        status: {
          in: ['running', 'post_processing']
        }
      },
      orderBy: { updatedAt: 'asc' },
      take: this.maxBatch,
      select: {
        id: true,
        progress: true,
        quality: true,
        sourceImageAssetId: true,
        prompt: true
      }
    });

    for (const job of activeJobs) {
      let providerJobId = await this.getProviderJobId(job.id);

      if (!providerJobId) {
        try {
          const started = await this.providerClient.startGeneration({
            localJobId: job.id,
            sourceImageAssetId: job.sourceImageAssetId,
            prompt: job.prompt,
            quality: job.quality
          });
          providerJobId = started.providerJobId;
          await this.setProviderJobId(job.id, providerJobId);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          await this.prisma.aiGenerationJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              progress: 0,
              errorCode: 'provider_poll_failed',
              errorMessage: message
            }
          });
          continue;
        }
      }

      let polled: ProviderPollResult;
      try {
        polled = await this.providerClient.pollGeneration(providerJobId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await this.prisma.aiGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            progress: 0,
            errorCode: 'provider_poll_failed',
            errorMessage: message
          }
        });
        await this.clearProviderJobId(job.id);
        continue;
      }

      if (polled.status === 'failed') {
        await this.prisma.aiGenerationJob.update({
          where: { id: job.id },
          data: {
            status: 'failed',
            errorCode: polled.errorCode ?? 'provider_failed',
            errorMessage: polled.errorMessage ?? 'Provider generation failed',
            progress: 0
          }
        });
        await this.clearProviderJobId(job.id);
        continue;
      }

      if (polled.status === 'ready') {
        const fullJob = await this.prisma.aiGenerationJob.findUnique({
          where: { id: job.id },
          include: {
            generatedAsset: true
          }
        });

        if (!fullJob) {
          continue;
        }

        try {
          await this.finalizeJob(fullJob, polled);
          await this.clearProviderJobId(job.id);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const mappedCode = message.startsWith('quality_gate_failed:')
            ? 'quality_gate_failed'
            : 'post_processing_failed';
          await this.prisma.aiGenerationJob.update({
            where: { id: job.id },
            data: {
              status: 'failed',
              errorCode: mappedCode,
              errorMessage: message,
              progress: 0
            }
          });
          await this.clearProviderJobId(job.id);
        }
        continue;
      }

      const nextStatus = polled.status === 'post_processing' ? 'post_processing' : 'running';
      const nextProgress = Math.max(job.progress, Math.min(polled.progress, 95));
      await this.prisma.aiGenerationJob.update({
        where: { id: job.id },
        data: {
          status: nextStatus,
          progress: nextProgress,
          errorCode: null,
          errorMessage: null
        }
      });
    }
  }

  private async finalizeJob(
    job: Pick<AiGenerationJob, 'id' | 'quality' | 'sourceImageAssetId'> & {
      generatedAsset: { id: string } | null;
    },
    providerResult: ProviderPollResult
  ) {
    if (job.generatedAsset) {
      await this.prisma.aiGenerationJob.update({
        where: { id: job.id },
        data: {
          status: 'ready',
          progress: 100,
          errorCode: null,
          errorMessage: null
        }
      });
      return;
    }

    const dims = providerResult.output?.bounds
      ? {
          x: Number(providerResult.output.bounds.x ?? 1),
          y: Number(providerResult.output.bounds.y ?? 1),
          z: Number(providerResult.output.bounds.z ?? 1)
        }
      : job.quality === 'low'
        ? { x: 0.8, y: 0.9, z: 0.8 }
        : { x: 1.2, y: 1.35, z: 1.1 };

    const boundsJson: Prisma.InputJsonValue = {
      x: dims.x,
      y: dims.y,
      z: dims.z
    };

    const footprintPoints: Prisma.InputJsonValue = [
      { x: -dims.x / 2, z: -dims.z / 2 },
      { x: dims.x / 2, z: -dims.z / 2 },
      { x: dims.x / 2, z: dims.z / 2 },
      { x: -dims.x / 2, z: dims.z / 2 }
    ];
    const footprintPointList = [
      { x: -dims.x / 2, z: -dims.z / 2 },
      { x: dims.x / 2, z: -dims.z / 2 },
      { x: dims.x / 2, z: dims.z / 2 },
      { x: -dims.x / 2, z: dims.z / 2 }
    ];

    const resolvedAssets = await this.resolveProviderAssets(job.id, providerResult);
    const glbAssetId = resolvedAssets.glbAssetId;
    const objAssetId = resolvedAssets.objAssetId;
    const previewImageAssetId = resolvedAssets.previewImageAssetId;

    if (!glbAssetId) {
      throw new Error('post_processing_failed:missing_glb_asset_id');
    }

    this.validateQualityGates({
      dims,
      footprintPoints: footprintPointList,
      glbAssetId,
      previewImageAssetId
    });

    await this.prisma.$transaction(async (tx) => {
      const generatedAsset = await tx.aiGeneratedAsset.create({
        data: {
          generationJobId: job.id,
          glbAssetId,
          objAssetId,
          previewImageAssetId,
          boundsJson,
          pivotMode: 'bottom-center',
          normalizedUnit: 'meter',
          status: 'ready'
        }
      });

      await tx.objectFootprint2d.create({
        data: {
          generatedAssetId: generatedAsset.id,
          shapeType: 'rect',
          pointsJson: footprintPoints,
          width: dims.x,
          depth: dims.z
        }
      });

      await tx.aiGenerationJob.update({
        where: {
          id: job.id
        },
        data: {
          status: 'ready',
          progress: 100,
          errorCode: null,
          errorMessage: null
        }
      });
    });

    this.logger.log(`AI generation finalized: ${job.id} (${job.sourceImageAssetId})`);
  }

  private async resolveProviderAssets(jobId: string, providerResult: ProviderPollResult) {
    let glbAssetId = providerResult.output?.glbAssetId;
    let objAssetId = providerResult.output?.objAssetId;
    let previewImageAssetId = providerResult.output?.previewImageAssetId;

    if (!glbAssetId && providerResult.output?.glbUrl) {
      const uploaded = await this.assetsService.uploadFromExternalUrl({
        sourceUrl: providerResult.output.glbUrl,
        objectKey: `generated/ai/${jobId}/model.glb`,
        contentTypeFallback: 'model/gltf-binary'
      });
      glbAssetId = uploaded.objectKey;
    }

    if (!objAssetId && providerResult.output?.objUrl) {
      const uploaded = await this.assetsService.uploadFromExternalUrl({
        sourceUrl: providerResult.output.objUrl,
        objectKey: `generated/ai/${jobId}/model.obj`,
        contentTypeFallback: 'text/plain'
      });
      objAssetId = uploaded.objectKey;
    }

    if (!previewImageAssetId && providerResult.output?.previewImageUrl) {
      const uploaded = await this.assetsService.uploadFromExternalUrl({
        sourceUrl: providerResult.output.previewImageUrl,
        objectKey: `generated/ai/${jobId}/preview.png`,
        contentTypeFallback: 'image/png'
      });
      previewImageAssetId = uploaded.objectKey;
    }

    return {
      glbAssetId,
      objAssetId,
      previewImageAssetId
    };
  }
}
