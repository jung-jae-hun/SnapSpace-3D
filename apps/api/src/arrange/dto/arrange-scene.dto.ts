import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class ArrangeSceneDto {
  @ApiProperty({ enum: ['align-x', 'align-z', 'space-x', 'snap-grid'] })
  @IsString()
  @IsIn(['align-x', 'align-z', 'space-x', 'snap-grid'])
  action!: 'align-x' | 'align-z' | 'space-x' | 'snap-grid';

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  objectIds?: string[];

  @ApiProperty({ required: false, example: 1, minimum: 0.1, maximum: 20 })
  @IsOptional()
  @IsNumber()
  @Min(0.1)
  @Max(20)
  gridSize?: number;
}
