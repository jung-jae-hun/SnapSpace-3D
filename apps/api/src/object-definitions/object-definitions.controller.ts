import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtPayload } from '../auth/jwt-payload.type';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AiGenerationsService } from '../ai/ai-generations.service';
import { CreateObjectDefinitionDto } from './dto/create-object-definition.dto';
import { UpdateObjectDefinitionDto } from './dto/update-object-definition.dto';
import { ObjectDefinitionsService } from './object-definitions.service';

type AuthenticatedRequest = {
  user: JwtPayload;
};

@ApiTags('object-definitions')
@UseGuards(JwtAuthGuard)
@Controller('object-definitions')
export class ObjectDefinitionsController {
  constructor(
    private readonly objectDefinitionsService: ObjectDefinitionsService,
    private readonly aiGenerationsService: AiGenerationsService
  ) {}

  @Post('from-generation/:generationId')
  @ApiOperation({ summary: 'AI 생성 결과를 object definition으로 등록(alias)' })
  promoteFromGeneration(
    @Req() req: AuthenticatedRequest,
    @Param('generationId') generationId: string
  ) {
    return this.aiGenerationsService.promoteToObjectDefinition(req.user.sub, generationId);
  }

  @Post()
  @ApiOperation({ summary: '오브젝트 정의 생성' })
  create(@Body() dto: CreateObjectDefinitionDto) {
    return this.objectDefinitionsService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: '오브젝트 정의 목록 조회' })
  findAll(
    @Query('category') category?: string,
    @Query('includeInactive') includeInactive?: string,
    @Query('source') source?: 'manual' | 'ai'
  ) {
    return this.objectDefinitionsService.findAll(category, includeInactive === 'true', source);
  }

  @Get(':id')
  @ApiOperation({ summary: '오브젝트 정의 단건 조회' })
  findOne(@Param('id') id: string) {
    return this.objectDefinitionsService.findOne(id);
  }

  @Get(':id/lifecycle-events')
  @ApiOperation({ summary: '오브젝트 정의 라이프사이클 이벤트 조회' })
  listLifecycleEvents(@Param('id') id: string, @Query('limit') limit?: string) {
    const parsedLimit = limit ? Number(limit) : 20;
    return this.objectDefinitionsService.listLifecycleEvents(id, parsedLimit);
  }

  @Patch(':id')
  @ApiOperation({ summary: '오브젝트 정의 수정' })
  update(@Param('id') id: string, @Body() dto: UpdateObjectDefinitionDto) {
    return this.objectDefinitionsService.update(id, dto);
  }

  @Post(':id/deactivate')
  @ApiOperation({ summary: '오브젝트 정의 비활성화' })
  deactivate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.objectDefinitionsService.deactivate(id, req.user.sub);
  }

  @Post(':id/activate')
  @ApiOperation({ summary: '오브젝트 정의 활성화' })
  activate(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.objectDefinitionsService.activate(id, req.user.sub);
  }

  @Post(':id/new-version')
  @ApiOperation({ summary: '오브젝트 정의 신규 버전 생성' })
  createNewVersion(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    return this.objectDefinitionsService.createNewVersion(id, req.user.sub);
  }

  @Delete(':id')
  @ApiOperation({ summary: '오브젝트 정의 삭제' })
  remove(@Param('id') id: string) {
    return this.objectDefinitionsService.remove(id);
  }
}
