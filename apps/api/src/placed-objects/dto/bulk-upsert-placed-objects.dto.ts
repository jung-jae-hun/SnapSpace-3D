import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsOptional, ValidateNested } from 'class-validator';
import { CreatePlacedObjectDto } from './create-placed-object.dto';

export class BulkUpsertPlacedObjectsDto {
  @ApiProperty({ required: false, enum: ['replace', 'upsert'], default: 'replace' })
  @IsOptional()
  @IsIn(['replace', 'upsert'])
  mode?: 'replace' | 'upsert';

  @ApiProperty({ type: [CreatePlacedObjectDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePlacedObjectDto)
  items!: CreatePlacedObjectDto[];
}
