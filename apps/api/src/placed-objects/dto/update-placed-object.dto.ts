import { PartialType } from '@nestjs/swagger';
import { CreatePlacedObjectDto } from './create-placed-object.dto';

export class UpdatePlacedObjectDto extends PartialType(CreatePlacedObjectDto) {}
