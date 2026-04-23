import { PartialType } from '@nestjs/swagger';
import { CreateObjectDefinitionDto } from './create-object-definition.dto';

export class UpdateObjectDefinitionDto extends PartialType(CreateObjectDefinitionDto) {}
