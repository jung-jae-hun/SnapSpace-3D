import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export enum GenerationQualityDto {
  low = 'low',
  standard = 'standard'
}

export class CreateAiGenerationDto {
  @ApiProperty({ example: 'cmocg0tmn000moc3t0tnkeltv' })
  @IsString()
  @MinLength(8)
  sceneId!: string;

  @ApiProperty({ example: 'asset_source_image_cuid' })
  @IsString()
  @MinLength(8)
  sourceImageAssetId!: string;

  @ApiPropertyOptional({ example: 'wooden stool, clean silhouette' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  prompt?: string;

  @ApiPropertyOptional({ enum: GenerationQualityDto, default: GenerationQualityDto.standard })
  @IsOptional()
  @IsEnum(GenerationQualityDto)
  quality?: GenerationQualityDto;
}
