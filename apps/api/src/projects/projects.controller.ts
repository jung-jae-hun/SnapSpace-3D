import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.type';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

type AuthenticatedRequest = {
  user: JwtPayload;
};

@ApiTags('projects')
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: '프로젝트 생성' })
  create(@Req() req: AuthenticatedRequest, @Body() dto: CreateProjectDto) {
    return this.projectsService.createForUser(req.user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: '현재 사용자 프로젝트 목록' })
  findByOwner(@Req() req: AuthenticatedRequest) {
    return this.projectsService.findByOwner(req.user.sub);
  }

  @Get(':projectId')
  @ApiOperation({ summary: '프로젝트 단건 조회' })
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('projectId') projectId: string
  ) {
    return this.projectsService.findOneForUser(projectId, req.user.sub);
  }
}
