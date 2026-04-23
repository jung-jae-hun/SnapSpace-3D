import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserContextDto } from '../common/dto/user-context.dto';
import { CreateProjectDto } from './dto/create-project.dto';
import { ProjectsService } from './projects.service';

@ApiTags('projects')
@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  @ApiOperation({ summary: '프로젝트 생성' })
  create(@Body() dto: CreateProjectDto) {
    return this.projectsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '오너 이메일 기준 프로젝트 목록' })
  findByOwner(@Query() query: UserContextDto) {
    return this.projectsService.findByOwnerEmail(query.email);
  }

  @Get(':projectId')
  @ApiOperation({ summary: '프로젝트 단건 조회' })
  findOne(@Param('projectId') projectId: string) {
    return this.projectsService.findOne(projectId);
  }
}
