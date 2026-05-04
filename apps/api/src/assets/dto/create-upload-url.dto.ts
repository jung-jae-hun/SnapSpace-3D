import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, MaxLength, MinLength, Min } from 'class-validator';

export class CreateUploadUrlDto {
  @ApiProperty({ example: 'models/station/platform_gate_basic.glb' })
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  objectKey!: string;

  @ApiProperty({ example: 'application/octet-stream' })
  @IsString()
  @MinLength(3)
  @MaxLength(120)
  contentType!: string;

  @ApiProperty({ example: 1048576, required: false, description: '업로드 파일 크기(bytes)' })
  @IsOptional()
  @IsInt()
  @Min(1)
  contentLength?: number;
}
