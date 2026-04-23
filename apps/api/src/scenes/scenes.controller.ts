import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.type';
import { CreateSceneDto } from './dto/create-scene.dto';
import { ScenesService } from './scenes.service';

type AuthenticatedRequest = {
  user: JwtPayload;
};

@ApiTags('scenes')
@UseGuards(JwtAuthGuard)
@Controller()
export class ScenesController {
  constructor(private readonly scenesService: ScenesService) {}

  @Post('projects/:projectId/scenes')
  @ApiOperation({ summary: '프로젝트 하위 씬 생성' })
  create(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() dto: CreateSceneDto
  ) {
    return this.scenesService.create(req.user.sub, projectId, dto);
  }

  @Get('projects/:projectId/scenes')
  @ApiOperation({ summary: '프로젝트 하위 씬 목록' })
  findByProject(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string
  ) {
    return this.scenesService.findByProject(req.user.sub, projectId);
  }

  @Get('scenes/:sceneId')
  @ApiOperation({ summary: '씬 단건 조회' })
  findOne(@Req() req: AuthenticatedRequest, @Param('sceneId') sceneId: string) {
    return this.scenesService.findOne(req.user.sub, sceneId);
  }
}
