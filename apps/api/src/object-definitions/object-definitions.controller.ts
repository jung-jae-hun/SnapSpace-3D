import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateObjectDefinitionDto } from './dto/create-object-definition.dto';
import { UpdateObjectDefinitionDto } from './dto/update-object-definition.dto';
import { ObjectDefinitionsService } from './object-definitions.service';

@ApiTags('object-definitions')
@Controller('object-definitions')
export class ObjectDefinitionsController {
  constructor(
    private readonly objectDefinitionsService: ObjectDefinitionsService
  ) {}

  @Post()
  @ApiOperation({ summary: '오브젝트 정의 생성' })
  create(@Body() dto: CreateObjectDefinitionDto) {
    return this.objectDefinitionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '오브젝트 정의 목록 조회' })
  findAll(@Query('category') category?: string) {
    return this.objectDefinitionsService.findAll(category);
  }

  @Get(':id')
  @ApiOperation({ summary: '오브젝트 정의 단건 조회' })
  findOne(@Param('id') id: string) {
    return this.objectDefinitionsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: '오브젝트 정의 수정' })
  update(@Param('id') id: string, @Body() dto: UpdateObjectDefinitionDto) {
    return this.objectDefinitionsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '오브젝트 정의 삭제' })
  remove(@Param('id') id: string) {
    return this.objectDefinitionsService.remove(id);
  }
}
