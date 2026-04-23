import { Injectable } from '@nestjs/common';
import { Client as MinioClient } from 'minio';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

@Injectable()
export class AssetsService {
  private readonly bucket = process.env.MINIO_BUCKET ?? 'snapspace-assets';
  private readonly minioClient = new MinioClient({
    endPoint: process.env.MINIO_ENDPOINT ?? 'localhost',
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: false,
    accessKey: process.env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? 'minioadmin'
  });

  async createUploadUrl(dto: CreateUploadUrlDto) {
    const hasBucket = await this.minioClient.bucketExists(this.bucket);
    if (!hasBucket) {
      await this.minioClient.makeBucket(this.bucket);
    }

    const expiresInSeconds = 60 * 10;
    const uploadUrl = await this.minioClient.presignedPutObject(
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
}
