import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkUpsertPlacedObjectsDto } from './dto/bulk-upsert-placed-objects.dto';
import { CreatePlacedObjectDto } from './dto/create-placed-object.dto';
import { UpdatePlacedObjectDto } from './dto/update-placed-object.dto';
import { PlacedObjectsService } from './placed-objects.service';

@ApiTags('placed-objects')
@UseGuards(JwtAuthGuard)
@Controller('scenes/:sceneId/placed-objects')
export class PlacedObjectsController {
  constructor(private readonly placedObjectsService: PlacedObjectsService) {}

  @Post()
  @ApiOperation({ summary: '씬에 배치 오브젝트 생성' })
  create(
    @Param('sceneId') sceneId: string,
    @Body() dto: CreatePlacedObjectDto
  ) {
    return this.placedObjectsService.create(sceneId, dto);
  }

  @Get()
  @ApiOperation({ summary: '씬의 배치 오브젝트 목록 조회' })
  findByScene(@Param('sceneId') sceneId: string) {
    return this.placedObjectsService.findByScene(sceneId);
  }

  @Patch(':id')
  @ApiOperation({ summary: '씬 배치 오브젝트 수정' })
  update(
    @Param('sceneId') sceneId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePlacedObjectDto
  ) {
    return this.placedObjectsService.update(sceneId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: '씬 배치 오브젝트 삭제' })
  remove(@Param('sceneId') sceneId: string, @Param('id') id: string) {
    return this.placedObjectsService.remove(sceneId, id);
  }

  @Post('bulk')
  @ApiOperation({ summary: '씬 배치 오브젝트 전체 대체(bulk)' })
  bulkUpsert(
    @Param('sceneId') sceneId: string,
    @Body() dto: BulkUpsertPlacedObjectsDto
  ) {
    return this.placedObjectsService.bulkUpsert(sceneId, dto);
  }

  @Post('rollforward')
  @ApiOperation({ summary: '씬 배치 오브젝트 버전 롤포워드 교체' })
  rollforward(
    @Param('sceneId') sceneId: string,
    @Body() dto: { fromObjectDefinitionId: string; toObjectDefinitionId: string }
  ) {
    return this.placedObjectsService.rollforwardObjectDefinition(
      sceneId,
      dto.fromObjectDefinitionId,
      dto.toObjectDefinitionId
    );
  }
}
