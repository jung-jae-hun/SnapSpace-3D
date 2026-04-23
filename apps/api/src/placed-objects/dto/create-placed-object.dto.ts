import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreatePlacedObjectDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MinLength(3)
  id?: string;

  @ApiProperty()
  @IsString()
  @MinLength(3)
  objectDefinitionId!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ example: { x: 0, y: 0, z: 0 } })
  @IsObject()
  position!: Record<string, unknown>;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsNumber()
  rotationY?: number;

  @ApiProperty({ example: { x: 1, y: 1, z: 1 } })
  @IsObject()
  scale!: Record<string, unknown>;

  @ApiProperty({ required: false })
  @IsOptional()
  params?: Record<string, unknown>;
}
