import { Injectable, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';
import { randomUUID } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import IORedis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSceneExportDto } from './dto/create-scene-export.dto';

type ExportStatus = 'queued' | 'processing' | 'succeeded' | 'failed';

type ExportJobData = {
  exportId: string;
  sceneId: string;
  userId: string;
  format: 'glb';
  timeoutMs: number;
  retryLimit: number;
  generatedObjects: Array<{
    id: string;
    sourcePlacedObjectId: string;
    meshType: string;
    position: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number };
    scale: { x: number; y: number; z: number };
  }>;
};

type ExportRecord = {
  id: string;
  sceneId: string;
  userId: string;
  format: 'glb';
  status: ExportStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  retryLimit: number;
  retryCount: number;
  timeoutMs: number;
  filePath?: string;
  fileSize?: number;
  lastError?: string;
};

@Injectable()
export class ExportsService {
  private readonly redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null
  });

  private readonly queue = new Queue<ExportJobData>('scene-export', {
    connection: this.redis
  });

  constructor(private readonly prisma: PrismaService) {}

  async createSceneExport(userId: string, sceneId: string, dto: CreateSceneExportDto) {
    await this.ensureOwnedScene(userId, sceneId);

    const exportId = randomUUID();
    const format = dto.format ?? 'glb';
    const retryLimit = Number(process.env.EXPORT_RETRY_LIMIT ?? 3);
    const timeoutMs = Number(process.env.EXPORT_JOB_TIMEOUT_MS ?? 45000);

    const generatedObjects = await this.loadGeneratedObjects(sceneId);

    const record: ExportRecord = {
      id: exportId,
      sceneId,
      userId,
      format,
      status: 'queued',
      createdAt: new Date().toISOString(),
      retryLimit,
      retryCount: 0,
      timeoutMs
    };

    await this.writeRecord(record);
    await this.redis.lpush(this.sceneExportsKey(sceneId), exportId);

    await this.queue.add(
      'create-glb',
      {
        exportId,
        sceneId,
        userId,
        format,
        timeoutMs,
        retryLimit,
        generatedObjects
      },
      {
        jobId: exportId,
        attempts: retryLimit,
        backoff: { type: 'fixed', delay: 1500 },
        removeOnComplete: true,
        removeOnFail: false
      }
    );

    return this.withDownloadUrl(record);
  }

  async listSceneExports(userId: string, sceneId: string) {
    await this.ensureOwnedScene(userId, sceneId);

    const exportIds = await this.redis.lrange(this.sceneExportsKey(sceneId), 0, 49);
    const records = await Promise.all(exportIds.map((id) => this.readRecord(id)));

    return records
      .filter((item): item is ExportRecord => Boolean(item))
      .filter((item) => item.userId === userId)
      .map((item) => this.withDownloadUrl(item));
  }

  async getExport(userId: string, exportId: string) {
    const record = await this.readRecord(exportId);

    if (!record || record.userId !== userId) {
      throw new NotFoundException('Export not found');
    }

    return this.withDownloadUrl(record);
  }

  async getDownloadFile(userId: string, exportId: string) {
    const record = await this.readRecord(exportId);

    if (!record || record.userId !== userId) {
      throw new NotFoundException('Export not found');
    }

    if (record.status !== 'succeeded' || !record.filePath) {
      throw new NotFoundException('Export file not ready');
    }

    if (!existsSync(record.filePath)) {
      throw new NotFoundException('Export file missing');
    }

    return readFileSync(record.filePath);
  }

  async markProcessing(exportId: string) {
    const record = await this.readRecord(exportId);
    if (!record) {
      return;
    }

    const next: ExportRecord = {
      ...record,
      status: 'processing',
      startedAt: new Date().toISOString()
    };

    await this.writeRecord(next);
  }

  async markSucceeded(exportId: string, filePath: string, fileSize: number) {
    const record = await this.readRecord(exportId);
    if (!record) {
      return;
    }

    const next: ExportRecord = {
      ...record,
      status: 'succeeded',
      completedAt: new Date().toISOString(),
      filePath,
      fileSize,
      lastError: undefined
    };

    await this.writeRecord(next);
  }

  async markFailed(exportId: string, errorMessage: string, retryCount: number) {
    const record = await this.readRecord(exportId);
    if (!record) {
      return;
    }

    const next: ExportRecord = {
      ...record,
      status: 'failed',
      completedAt: new Date().toISOString(),
      lastError: errorMessage,
      retryCount
    };

    await this.writeRecord(next);
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
  }

  private async loadGeneratedObjects(sceneId: string) {
    const placed = await this.prisma.placedObject.findMany({
      where: { sceneId },
      include: {
        objectDefinition: {
          select: {
            code: true,
            category: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return placed.map((item) => ({
      id: `gen-${item.id}`,
      sourcePlacedObjectId: item.id,
      meshType: item.objectDefinition.code || item.objectDefinition.category || 'object',
      position: this.parseVec3(item.position, 0),
      rotation: { x: 0, y: Number(item.rotationY ?? 0), z: 0 },
      scale: this.parseVec3(item.scale, 1)
    }));
  }

  private parseVec3(value: unknown, defaultValue: number) {
    const input = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

    return {
      x: Number(input.x ?? defaultValue),
      y: Number(input.y ?? defaultValue),
      z: Number(input.z ?? defaultValue)
    };
  }

  private sceneExportsKey(sceneId: string) {
    return `snapspace:exports:scene:${sceneId}`;
  }

  private exportKey(exportId: string) {
    return `snapspace:export:${exportId}`;
  }

  private async writeRecord(record: ExportRecord) {
    await this.redis.hset(this.exportKey(record.id), this.serialize(record));
  }

  private async readRecord(exportId: string): Promise<ExportRecord | null> {
    const values = await this.redis.hgetall(this.exportKey(exportId));
    if (!values.id) {
      return null;
    }

    return this.deserialize(values);
  }

  private serialize(record: ExportRecord): Record<string, string> {
    return {
      id: record.id,
      sceneId: record.sceneId,
      userId: record.userId,
      format: record.format,
      status: record.status,
      createdAt: record.createdAt,
      startedAt: record.startedAt ?? '',
      completedAt: record.completedAt ?? '',
      retryLimit: String(record.retryLimit),
      retryCount: String(record.retryCount),
      timeoutMs: String(record.timeoutMs),
      filePath: record.filePath ?? '',
      fileSize: record.fileSize ? String(record.fileSize) : '',
      lastError: record.lastError ?? ''
    };
  }

  private deserialize(values: Record<string, string>): ExportRecord {
    return {
      id: values.id,
      sceneId: values.sceneId,
      userId: values.userId,
      format: (values.format as 'glb') ?? 'glb',
      status: (values.status as ExportStatus) ?? 'queued',
      createdAt: values.createdAt,
      startedAt: values.startedAt || undefined,
      completedAt: values.completedAt || undefined,
      retryLimit: Number(values.retryLimit || 0),
      retryCount: Number(values.retryCount || 0),
      timeoutMs: Number(values.timeoutMs || 0),
      filePath: values.filePath || undefined,
      fileSize: values.fileSize ? Number(values.fileSize) : undefined,
      lastError: values.lastError || undefined
    };
  }

  private withDownloadUrl(record: ExportRecord) {
    return {
      ...record,
      downloadUrl: record.status === 'succeeded' ? `/api/v1/exports/${record.id}/download` : null
    };
  }
}
