import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

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
}
