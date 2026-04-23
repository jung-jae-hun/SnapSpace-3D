import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AssetsService } from './assets.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

@ApiTags('assets')
@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'MinIO 업로드용 Presigned URL 생성' })
  createUploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.assetsService.createUploadUrl(dto);
  }
}
