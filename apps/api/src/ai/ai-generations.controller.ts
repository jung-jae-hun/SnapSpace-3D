import { Controller, Get, Param, Post, Req, UseGuards, Body } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.type';
import { AiGenerationsService } from './ai-generations.service';
import { CreateAiGenerationDto } from './dto/create-ai-generation.dto';

type AuthenticatedRequest = {
  user: JwtPayload;
};

@ApiTags('ai-generations')
@UseGuards(JwtAuthGuard)
@Controller('ai/generations')
export class AiGenerationsController {
  constructor(private readonly aiGenerationsService: AiGenerationsService) {}

  @Get('metrics/summary')
  @ApiOperation({ summary: '최근 24시간 AI 생성 메트릭 요약' })
  metrics(@Req() req: AuthenticatedRequest) {
    return this.aiGenerationsService.getMetricsSummary(req.user.sub);
  }

  @Post()
  @ApiOperation({ summary: 'AI 3D 생성 작업 생성' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateAiGenerationDto) {
    return this.aiGenerationsService.create(req.user.sub, dto);
  }

  @Get(':generationId')
  @ApiOperation({ summary: 'AI 3D 생성 작업 조회' })
  findOne(@Req() req: AuthenticatedRequest, @Param('generationId') generationId: string) {
    return this.aiGenerationsService.findOne(req.user.sub, generationId);
  }

  @Post(':generationId/cancel')
  @ApiOperation({ summary: 'AI 3D 생성 작업 취소' })
  cancel(@Req() req: AuthenticatedRequest, @Param('generationId') generationId: string) {
    return this.aiGenerationsService.cancel(req.user.sub, generationId);
  }

  @Post(':generationId/promote')
  @ApiOperation({ summary: '생성 결과를 object definition으로 등록' })
  promote(@Req() req: AuthenticatedRequest, @Param('generationId') generationId: string) {
    return this.aiGenerationsService.promoteToObjectDefinition(req.user.sub, generationId);
  }
}
