import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString } from 'class-validator';

export class CreateSceneExportDto {
  @ApiProperty({ required: false, enum: ['glb'], default: 'glb' })
  @IsOptional()
  @IsString()
  @IsIn(['glb'])
  format?: 'glb';
}
