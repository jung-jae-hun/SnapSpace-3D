import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateSceneDto {
  @ApiProperty({ example: 'Main Hall Layout' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 1, required: false })
  @IsOptional()
  version?: number;
}
