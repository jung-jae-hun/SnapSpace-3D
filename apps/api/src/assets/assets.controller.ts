import { Body, Controller, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssetsService } from './assets.service';
import { CreateUploadUrlDto } from './dto/create-upload-url.dto';

@ApiTags('assets')
@Controller('assets')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('upload-url')
  @ApiOperation({ summary: 'MinIO 업로드용 Presigned URL 생성' })
  createUploadUrl(@Body() dto: CreateUploadUrlDto) {
    return this.assetsService.createUploadUrl(dto);
  }
}
