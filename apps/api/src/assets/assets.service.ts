import { Injectable } from '@nestjs/common';
import { Client as MinioClient } from 'minio';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

@Injectable()
export class AssetsService {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'snapspace-assets';
  private readonly minioPort = Number(process.env.MINIO_PORT ?? 9000);
  private readonly minioUseSSL = process.env.MINIO_USE_SSL === 'true';
  private readonly minioInternalEndpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  private readonly minioPublicEndpoint =
    process.env.MINIO_PUBLIC_ENDPOINT ??
    (this.minioInternalEndpoint === 'minio' ? 'localhost' : this.minioInternalEndpoint);
  private readonly minioPublicPort = Number(process.env.MINIO_PUBLIC_PORT ?? this.minioPort);
  private readonly minioPublicUseSSL =
    (process.env.MINIO_PUBLIC_USE_SSL ?? `${this.minioUseSSL}`) === 'true';
  private readonly providerDownloadMaxBytes = Number(
    process.env.AI_PROVIDER_DOWNLOAD_MAX_BYTES ?? `${50 * 1024 * 1024}`
  );
  private readonly minioClient = new MinioClient({
    endPoint: this.minioInternalEndpoint,
    port: this.minioPort,
    useSSL: this.minioUseSSL,
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin'
  });
  private readonly minioPublicClient = new MinioClient({
    endPoint: this.minioPublicEndpoint,
    port: this.minioPublicPort,
    useSSL: this.minioPublicUseSSL,
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin'
  });

  private async ensureBucket() {
    const hasBucket = await this.minioClient.bucketExists(this.bucket);
    if (!hasBucket) {
      await this.minioClient.makeBucket(this.bucket);
    }
  }

  async createUploadUrl(dto: CreateUploadUrlDto) {
    await this.ensureBucket();

    const expiresInSeconds = 60 * 10;
    const uploadUrl = await this.minioPublicClient.presignedPutObject(
      this.bucket,
      dto.objectKey,
      expiresInSeconds
    );

    return {
      bucket: this.bucket,
      objectKey: dto.objectKey,
      contentType: dto.contentType,
      expiresInSeconds,
      uploadUrl
    };
  }

  async uploadFromExternalUrl(params: {
    sourceUrl: string;
    objectKey: string;
    contentTypeFallback: string;
  }) {
    await this.ensureBucket();

    const response = await fetch(params.sourceUrl);
    if (!response.ok) {
      throw new Error(`asset_download_failed: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength <= 0) {
      throw new Error('asset_download_failed: empty body');
    }

    if (arrayBuffer.byteLength > this.providerDownloadMaxBytes) {
      throw new Error(
        `asset_download_too_large: ${arrayBuffer.byteLength} > ${this.providerDownloadMaxBytes}`
      );
    }

    const body = Buffer.from(arrayBuffer);
    const contentType = response.headers.get('content-type') || params.contentTypeFallback;

    await this.minioClient.putObject(this.bucket, params.objectKey, body, body.byteLength, {
      'Content-Type': contentType
    });

    return {
      bucket: this.bucket,
      objectKey: params.objectKey,
      contentType,
      size: body.byteLength
    };
  }
}
