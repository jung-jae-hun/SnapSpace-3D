import { Injectable, Logger } from '@nestjs/common';
import type { GenerationQuality } from '@prisma/client';

type ProviderPollStatus = 'running' | 'post_processing' | 'ready' | 'failed';

type ProviderOutput = {
  glbAssetId?: string;
  objAssetId?: string;
  previewImageAssetId?: string;
  glbUrl?: string;
  objUrl?: string;
  previewImageUrl?: string;
  bounds?: { x: number; y: number; z: number };
};

export type ProviderPollResult = {
  status: ProviderPollStatus;
  progress: number;
  errorCode?: string;
  errorMessage?: string;
  output?: ProviderOutput;
};

export type StartProviderInput = {
  localJobId: string;
  sourceImageAssetId: string;
  prompt?: string | null;
  quality: GenerationQuality;
};

@Injectable()
export class AiProviderClient {
  private readonly logger = new Logger(AiProviderClient.name);
  private readonly mode = (process.env.AI_PROVIDER_MODE ?? 'mock').toLowerCase();
  private readonly localFallbackToMock =
    (process.env.AI_PROVIDER_LOCAL_FALLBACK_TO_MOCK ?? 'true').toLowerCase() !== 'false';
  private readonly baseUrl = process.env.AI_PROVIDER_BASE_URL ?? '';
  private readonly submitPath = process.env.AI_PROVIDER_SUBMIT_PATH ?? '/v1/image-to-3d/jobs';
  private readonly statusPathTemplate =
    process.env.AI_PROVIDER_STATUS_PATH ?? '/v1/image-to-3d/jobs/{jobId}';
  private readonly apiKey = process.env.AI_PROVIDER_API_KEY ?? '';
  private readonly sourceImageUrlTemplate = process.env.AI_PROVIDER_SOURCE_IMAGE_URL_TEMPLATE ?? '';
  private readonly debug = process.env.AI_PROVIDER_DEBUG === 'true';
  private readonly submitJobIdPaths = this.parsePaths(
    process.env.AI_PROVIDER_SUBMIT_JOB_ID_PATHS,
    [
      'jobId',
      'id',
      'result.id',
      'data.id',
      'result.jobId',
      'job_id',
      'task_id',
      'data.task_id',
      'result.task_id'
    ]
  );
  private readonly pollStatusPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_STATUS_PATHS,
    ['status', 'state', 'result.status', 'data.status', 'result.state', 'data.state']
  );
  private readonly pollProgressPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_PROGRESS_PATHS,
    [
      'progress',
      'percentage',
      'percent',
      'result.progress',
      'data.progress',
      'result.percentage',
      'data.percentage'
    ]
  );
  private readonly pollErrorCodePaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_ERROR_CODE_PATHS,
    [
      'errorCode',
      'error.code',
      'result.error.code',
      'data.error.code',
      'errorCode.value'
    ]
  );
  private readonly pollErrorMessagePaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_ERROR_MESSAGE_PATHS,
    [
      'errorMessage',
      'message',
      'error.message',
      'result.error.message',
      'data.error.message',
      'errorMessage.value'
    ]
  );
  private readonly pollGlbAssetIdPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_GLB_ASSET_ID_PATHS,
    ['output.glbAssetId', 'result.output.glbAssetId', 'data.output.glbAssetId']
  );
  private readonly pollObjAssetIdPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_OBJ_ASSET_ID_PATHS,
    ['output.objAssetId', 'result.output.objAssetId', 'data.output.objAssetId']
  );
  private readonly pollPreviewAssetIdPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_PREVIEW_ASSET_ID_PATHS,
    [
      'output.previewImageAssetId',
      'result.output.previewImageAssetId',
      'data.output.previewImageAssetId'
    ]
  );
  private readonly pollGlbUrlPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_GLB_URL_PATHS,
    [
      'output.glbUrl',
      'output.modelUrl',
      'result.output.glbUrl',
      'result.output.modelUrl',
      'data.output.glbUrl',
      'data.output.modelUrl',
      'result.model_urls.glb',
      'result.model_urls.glb_url',
      'model_urls.glb',
      'model_urls.glb_url',
      'output.glb_url',
      'result.output.glb_url',
      'data.output.glb_url'
    ]
  );
  private readonly pollObjUrlPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_OBJ_URL_PATHS,
    [
      'output.objUrl',
      'result.output.objUrl',
      'data.output.objUrl',
      'result.model_urls.obj',
      'result.model_urls.obj_url',
      'model_urls.obj',
      'model_urls.obj_url',
      'output.obj_url',
      'result.output.obj_url',
      'data.output.obj_url'
    ]
  );
  private readonly pollPreviewUrlPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_PREVIEW_URL_PATHS,
    [
      'output.previewImageUrl',
      'output.thumbnailUrl',
      'result.output.previewImageUrl',
      'result.output.thumbnailUrl',
      'data.output.previewImageUrl',
      'data.output.thumbnailUrl',
      'result.thumbnail_url',
      'thumbnail_url',
      'output.preview_url',
      'result.output.preview_url',
      'data.output.preview_url'
    ]
  );
  private readonly pollBoundsPaths = this.parsePaths(
    process.env.AI_PROVIDER_POLL_BOUNDS_PATHS,
    ['output.bounds', 'result.output.bounds', 'data.output.bounds', 'result.bounds', 'bounds']
  );

  private readonly mockState = new Map<
    string,
    {
      startedAt: number;
      quality: GenerationQuality;
      sourceImageAssetId: string;
    }
  >();

  private seedMockState(providerJobId: string, input: StartProviderInput) {
    this.mockState.set(providerJobId, {
      startedAt: Date.now(),
      quality: input.quality,
      sourceImageAssetId: input.sourceImageAssetId
    });
  }

  private createFallbackMockJob(input: StartProviderInput) {
    const providerJobId = `mock-fallback-${input.localJobId}`;
    this.seedMockState(providerJobId, input);
    this.logger.warn(
      `Local provider unavailable, fallback to mock enabled (job=${input.localJobId})`
    );
    return { providerJobId };
  }

  private isMockJobId(providerJobId: string) {
    return providerJobId.startsWith('mock-');
  }

  isMockMode() {
    return this.mode === 'mock';
  }

  private isLocalMode() {
    return this.mode === 'local';
  }

  private isOpenSrcMode() {
    return this.mode === 'opensrc';
  }

  private getAuthHeader(): Record<string, string> {
    if (this.mode === 'meshy') {
      if (!this.apiKey) {
        throw new Error('AI provider is not configured (AI_PROVIDER_API_KEY)');
      }
      return { Authorization: `Bearer ${this.apiKey}` };
    }

    if ((this.isLocalMode() || this.isOpenSrcMode()) && this.apiKey) {
      return { Authorization: `Bearer ${this.apiKey}` };
    }

    return {};
  }

  private resolveSourceImageUrl(sourceImageAssetId: string) {
    if (!this.sourceImageUrlTemplate) {
      return undefined;
    }

    return this.sourceImageUrlTemplate.replace('{assetId}', encodeURIComponent(sourceImageAssetId));
  }

  async startGeneration(input: StartProviderInput): Promise<{ providerJobId: string }> {
    if (this.isMockMode()) {
      const providerJobId = `mock-${input.localJobId}`;
      this.seedMockState(providerJobId, input);
      return { providerJobId };
    }

    if (!this.baseUrl) {
      throw new Error('AI provider is not configured (AI_PROVIDER_BASE_URL)');
    }

    const sourceImageUrl = this.resolveSourceImageUrl(input.sourceImageAssetId);

    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${this.submitPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.getAuthHeader()
        },
        body: JSON.stringify({
          sourceImageRef: input.sourceImageAssetId,
          sourceImageUrl,
          prompt: input.prompt,
          quality: input.quality,
          mode: this.mode
        })
      });
    } catch (error) {
      if (this.isLocalMode() && this.localFallbackToMock) {
        return this.createFallbackMockJob(input);
      }
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`provider_start_failed: ${reason}`);
    }

    if (!response.ok) {
      const text = await response.text();
      if (this.isLocalMode() && this.localFallbackToMock) {
        this.logger.warn(
          `Local provider submit failed (${response.status}), fallback to mock enabled (job=${input.localJobId})`
        );
        return this.createFallbackMockJob(input);
      }
      throw new Error(`provider_start_failed: ${response.status} ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as unknown;
    this.logDebug('submit_response', data);
    const providerJobId = this.getFirstString(data, this.submitJobIdPaths);
    if (!providerJobId) {
      throw new Error('provider_start_failed: missing job id in response');
    }

    this.logDebug('submit_mapped', {
      providerJobId,
      submitJobIdPaths: this.submitJobIdPaths
    });

    return { providerJobId };
  }

  async pollGeneration(providerJobId: string): Promise<ProviderPollResult> {
    if (this.isMockMode() || this.isMockJobId(providerJobId)) {
      return this.pollMock(providerJobId);
    }

    if (!this.baseUrl) {
      throw new Error('AI provider is not configured (AI_PROVIDER_BASE_URL)');
    }

    const statusPath = this.statusPathTemplate.replace('{jobId}', providerJobId);
    const response = await fetch(`${this.baseUrl}${statusPath}`, {
      method: 'GET',
      headers: {
        ...this.getAuthHeader()
      }
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`provider_poll_failed: ${response.status} ${text.slice(0, 300)}`);
    }

    const data = (await response.json()) as unknown;
    this.logDebug('poll_response', data);

    const status = this.normalizeProviderStatus(this.getFirstString(data, this.pollStatusPaths));
    const progressValue = this.getFirstNumber(data, this.pollProgressPaths);
    const progress = Number.isFinite(progressValue) ? Number(progressValue) : status === 'ready' ? 100 : 50;

    const boundsRaw = this.getFirstObject(data, this.pollBoundsPaths);
    const bounds = boundsRaw
      ? {
          x: Number((boundsRaw as Record<string, unknown>).x ?? 1),
          y: Number((boundsRaw as Record<string, unknown>).y ?? 1),
          z: Number((boundsRaw as Record<string, unknown>).z ?? 1)
        }
      : undefined;

    const glbAssetId = this.getFirstString(data, this.pollGlbAssetIdPaths);
    const objAssetId = this.getFirstString(data, this.pollObjAssetIdPaths);
    const previewImageAssetId = this.getFirstString(data, this.pollPreviewAssetIdPaths);
    const glbUrl = this.getFirstString(data, this.pollGlbUrlPaths);
    const objUrl = this.getFirstString(data, this.pollObjUrlPaths);
    const previewImageUrl = this.getFirstString(data, this.pollPreviewUrlPaths);

    this.logDebug('poll_mapped', {
      providerJobId,
      status,
      progress,
      errorCode: this.getFirstString(data, this.pollErrorCodePaths),
      hasOutput:
        !!(
          glbAssetId ||
          objAssetId ||
          previewImageAssetId ||
          glbUrl ||
          objUrl ||
          previewImageUrl ||
          bounds
        ),
      matched: {
        glbAssetId,
        objAssetId,
        previewImageAssetId,
        glbUrl,
        objUrl,
        previewImageUrl,
        bounds
      }
    });

    return {
      status,
      progress: Math.max(0, Math.min(100, Math.floor(progress))),
      errorCode: this.getFirstString(data, this.pollErrorCodePaths),
      errorMessage: this.getFirstString(data, this.pollErrorMessagePaths),
      output:
        glbAssetId || objAssetId || previewImageAssetId || glbUrl || objUrl || previewImageUrl || bounds
        ? {
            glbAssetId,
            objAssetId,
            previewImageAssetId,
            glbUrl,
            objUrl,
            previewImageUrl,
            bounds
          }
        : undefined
    };
  }

  private parsePaths(value: string | undefined, fallback: string[]) {
    if (!value) {
      return fallback;
    }

    const parsed = value
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    return parsed.length > 0 ? parsed : fallback;
  }

  private getFirstString(payload: unknown, paths: string[]) {
    for (const path of paths) {
      const value = this.getByPath(payload, path);
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }
    return undefined;
  }

  private getFirstNumber(payload: unknown, paths: string[]) {
    for (const path of paths) {
      const value = this.getByPath(payload, path);
      if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
          return parsed;
        }
      }
    }
    return undefined;
  }

  private getFirstObject(payload: unknown, paths: string[]) {
    for (const path of paths) {
      const value = this.getByPath(payload, path);
      if (typeof value === 'object' && value !== null) {
        return value;
      }
    }
    return undefined;
  }

  private getByPath(payload: unknown, path: string) {
    if (!path) {
      return undefined;
    }

    const segments = path.split('.');
    let current: unknown = payload;

    for (const segment of segments) {
      if (typeof current !== 'object' || current === null) {
        return undefined;
      }

      const record = current as Record<string, unknown>;
      current = record[segment];
    }

    return current;
  }

  private logDebug(label: string, payload: unknown) {
    if (!this.debug) {
      return;
    }

    const safePayload = this.sanitizeForLog(payload);
    this.logger.log(`${label}: ${JSON.stringify(safePayload).slice(0, 2000)}`);
  }

  private sanitizeForLog(payload: unknown): unknown {
    if (typeof payload === 'string') {
      return payload.length > 600 ? `${payload.slice(0, 600)}...(truncated)` : payload;
    }

    if (Array.isArray(payload)) {
      return payload.slice(0, 20).map((item) => this.sanitizeForLog(item));
    }

    if (typeof payload === 'object' && payload !== null) {
      const masked = new Set(['authorization', 'token', 'accessToken', 'refreshToken', 'apiKey']);
      const record = payload as Record<string, unknown>;
      const out: Record<string, unknown> = {};

      for (const [key, value] of Object.entries(record)) {
        if (masked.has(key)) {
          out[key] = '***';
          continue;
        }
        out[key] = this.sanitizeForLog(value);
      }

      return out;
    }

    return payload;
  }

  private pollMock(providerJobId: string): ProviderPollResult {
    const state = this.mockState.get(providerJobId);
    if (!state) {
      this.logger.warn(`mock provider state missing: ${providerJobId}`);
      return {
        status: 'failed',
        progress: 0,
        errorCode: 'provider_state_missing',
        errorMessage: 'Provider state not found'
      };
    }

    const elapsedMs = Date.now() - state.startedAt;

    if (elapsedMs < 3000) {
      return { status: 'running', progress: 25 };
    }
    if (elapsedMs < 6000) {
      return { status: 'running', progress: 55 };
    }
    if (elapsedMs < 9000) {
      return { status: 'post_processing', progress: 90 };
    }

    const bounds =
      state.quality === 'low'
        ? { x: 0.8, y: 0.9, z: 0.8 }
        : { x: 1.2, y: 1.35, z: 1.1 };

    return {
      status: 'ready',
      progress: 100,
      output: {
        glbAssetId: `generated/ai/${providerJobId}/model.glb`,
        objAssetId: `generated/ai/${providerJobId}/model.obj`,
        previewImageAssetId: `generated/ai/${providerJobId}/preview.png`,
        bounds
      }
    };
  }

  private normalizeProviderStatus(value?: string): ProviderPollStatus {
    const raw = (value ?? '').toLowerCase();

    if (['ready', 'completed', 'succeeded', 'success', 'done'].includes(raw)) {
      return 'ready';
    }
    if (['failed', 'error', 'cancelled', 'canceled'].includes(raw)) {
      return 'failed';
    }
    if (['post_processing', 'postprocessing', 'finalizing'].includes(raw)) {
      return 'post_processing';
    }
    return 'running';
  }
}
