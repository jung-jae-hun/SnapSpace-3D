import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateProjectDto {
  @ApiProperty({ example: 'owner@snapspace.io' })
  @IsEmail()
  ownerEmail!: string;

  @ApiProperty({ example: 'Station Layout Demo' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: 'MVP layout test scene', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}
