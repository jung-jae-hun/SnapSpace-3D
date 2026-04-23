import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class UserContextDto {
  @ApiProperty({ example: 'owner@snapspace.io' })
  @IsEmail()
  email!: string;
}
