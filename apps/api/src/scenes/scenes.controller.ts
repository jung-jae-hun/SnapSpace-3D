import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateSceneDto } from './dto/create-scene.dto';
import { ScenesService } from './scenes.service';

@ApiTags('scenes')
@UseGuards(JwtAuthGuard)
@Controller()
export class ScenesController {
  constructor(private readonly scenesService: ScenesService) {}

  @Post('projects/:projectId/scenes')
  @ApiOperation({ summary: '프로젝트 하위 씬 생성' })
  create(
    @Param('projectId') projectId: string,
    @Body() dto: CreateSceneDto
  ) {
    return this.scenesService.create(projectId, dto);
  }

  @Get('projects/:projectId/scenes')
  @ApiOperation({ summary: '프로젝트 하위 씬 목록' })
  findByProject(@Param('projectId') projectId: string) {
    return this.scenesService.findByProject(projectId);
  }

  @Get('scenes/:sceneId')
  @ApiOperation({ summary: '씬 단건 조회' })
  findOne(@Param('sceneId') sceneId: string) {
    return this.scenesService.findOne(sceneId);
  }
}
