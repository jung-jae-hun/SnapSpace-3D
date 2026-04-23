import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  MinLength
} from 'class-validator';

export class CreateObjectDefinitionDto {
  @ApiProperty({ example: 'platform_gate_basic' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  code!: string;

  @ApiProperty({ example: 'Platform Gate Basic' })
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @ApiProperty({ example: 'gate' })
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  category!: string;

  @ApiProperty({ type: [String], example: ['platform', 'gate'] })
  @IsArray()
  @IsString({ each: true })
  tags!: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  modelAssetId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  thumbnailAssetId?: string;

  @ApiProperty({ required: false, example: { width: 2, depth: 1, height: 2.2 } })
  @IsOptional()
  defaultSize?: Record<string, unknown>;

  @ApiProperty({ required: false, example: 'bottom-center' })
  @IsOptional()
  @IsString()
  pivot?: string;

  @ApiProperty({ type: [Number], required: false, example: [0, 90, 180, 270] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  allowedRotations?: number[];

  @ApiProperty({ required: false })
  @IsOptional()
  sockets?: unknown;

  @ApiProperty({ required: false })
  @IsOptional()
  placementRules?: unknown;

  @ApiProperty({ required: false, example: { x: false, y: false, z: false } })
  @IsOptional()
  scalable?: Record<string, unknown>;
}
