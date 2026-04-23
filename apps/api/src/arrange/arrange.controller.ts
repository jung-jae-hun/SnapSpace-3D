import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.type';
import { ArrangeSceneDto } from './dto/arrange-scene.dto';
import { ArrangeService } from './arrange.service';

type AuthenticatedRequest = {
  user: JwtPayload;
};

@ApiTags('arrange')
@UseGuards(JwtAuthGuard)
@Controller('scenes/:sceneId')
export class ArrangeController {
  constructor(private readonly arrangeService: ArrangeService) {}

  @Post('arrange')
  @ApiOperation({ summary: '씬 배치 오브젝트 자동 정렬/스냅' })
  run(
    @Req() req: AuthenticatedRequest,
    @Param('sceneId') sceneId: string,
    @Body() dto: ArrangeSceneDto
  ) {
    return this.arrangeService.run(req.user.sub, sceneId, dto);
  }

  @Post('generate')
  @ApiOperation({ summary: '씬 GeneratedObject 생성(초기 버전)' })
  generate(@Req() req: AuthenticatedRequest, @Param('sceneId') sceneId: string) {
    return this.arrangeService.generate(req.user.sub, sceneId);
  }

  @Get('generated-objects')
  @ApiOperation({ summary: '씬 GeneratedObject 목록 조회' })
  listGenerated(@Req() req: AuthenticatedRequest, @Param('sceneId') sceneId: string) {
    return this.arrangeService.listGeneratedObjects(req.user.sub, sceneId);
  }
}
