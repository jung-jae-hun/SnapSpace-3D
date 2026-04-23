import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'owner@snapspace.io' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'snapspace1234', required: false })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiProperty({ example: 'SnapSpace Owner', required: false })
  @IsOptional()
  @IsString()
  name?: string;
}
