import { ApiProperty } from '@nestjs/swagger';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min
} from 'class-validator';

export class SceneCommandDto {
  @ApiProperty({ example: 'cmd-2f5ef3c8-1a2a-4f89-bd4c-00dd4f0a8891' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  commandId!: string;

  @ApiProperty({ enum: ['rename', 'archive', 'restore'] })
  @IsString()
  @IsIn(['rename', 'archive', 'restore'])
  action!: 'rename' | 'archive' | 'restore';

  @ApiProperty({ example: 1, minimum: 1 })
  @IsInt()
  @Min(1)
  expectedVersion!: number;

  @ApiProperty({ required: false, example: { name: 'Main Hall v2' } })
  @IsOptional()
  @IsObject()
  payload?: {
    name?: string;
  };
}
