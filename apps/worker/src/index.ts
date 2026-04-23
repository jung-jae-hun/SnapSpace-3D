import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { buildMockGlb } from './glb';

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

const redis = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null
});

const exportRoot = process.env.SNAPSPACE_EXPORT_DIR ?? '/tmp/snapspace-exports';
const concurrency = Number(process.env.EXPORT_WORKER_CONCURRENCY ?? 2);

function exportKey(exportId: string) {
  return `snapspace:export:${exportId}`;
}

async function setRecord(exportId: string, values: Record<string, string>) {
  await redis.hset(exportKey(exportId), values);
}

const worker = new Worker<ExportJobData>(
  'scene-export',
  async (job) => {
    await setRecord(job.data.exportId, {
      status: 'processing',
      startedAt: new Date().toISOString(),
      retryCount: String(job.attemptsMade)
    });

    await mkdir(exportRoot, { recursive: true });
    const filePath = path.join(exportRoot, `${job.data.exportId}.glb`);

    const run = async () => {
      const glb = buildMockGlb(job.data.sceneId, job.data.generatedObjects);
      await writeFile(filePath, glb);
      return glb;
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Export job timeout: ${job.data.timeoutMs}ms`));
      }, job.data.timeoutMs);

      timer.unref?.();
    });

    const glb = await Promise.race([run(), timeoutPromise]);

    await setRecord(job.data.exportId, {
      status: 'succeeded',
      completedAt: new Date().toISOString(),
      filePath,
      fileSize: String(glb.length),
      retryCount: String(job.attemptsMade),
      lastError: ''
    });

    return { filePath, fileSize: glb.length };
  },
  {
    connection: redis,
    concurrency
  }
);

worker.on('failed', async (job, error) => {
  if (!job) {
    return;
  }

  const attempts = job.opts.attempts ?? 1;
  const exhausted = job.attemptsMade >= attempts;

  await setRecord(job.data.exportId, {
    status: exhausted ? 'failed' : 'queued',
    completedAt: exhausted ? new Date().toISOString() : '',
    retryCount: String(job.attemptsMade),
    lastError: error.message
  });
});

worker.on('ready', () => {
  console.log(`[snapspace-worker] ready queue=scene-export concurrency=${concurrency}`);
});

worker.on('error', (error) => {
  console.error('[snapspace-worker] fatal error', error);
});
