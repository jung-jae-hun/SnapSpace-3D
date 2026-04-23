import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, ValidateNested } from 'class-validator';
import { CreatePlacedObjectDto } from './create-placed-object.dto';

export class BulkUpsertPlacedObjectsDto {
  @ApiProperty({ type: [CreatePlacedObjectDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePlacedObjectDto)
  items!: CreatePlacedObjectDto[];
}
