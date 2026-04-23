import {
  Body,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../auth/jwt-payload.type';
import { CreateSceneExportDto } from './dto/create-scene-export.dto';
import { ExportsService } from './exports.service';

type AuthenticatedRequest = {
  user: JwtPayload;
};

@ApiTags('exports')
@UseGuards(JwtAuthGuard)
@Controller()
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Post('scenes/:sceneId/exports')
  @ApiOperation({ summary: '씬 Export 작업 생성' })
  createSceneExport(
    @Req() req: AuthenticatedRequest,
    @Param('sceneId') sceneId: string,
    @Body() dto: CreateSceneExportDto
  ) {
    return this.exportsService.createSceneExport(req.user.sub, sceneId, dto);
  }

  @Get('scenes/:sceneId/exports')
  @ApiOperation({ summary: '씬 Export 이력 조회' })
  listSceneExports(@Req() req: AuthenticatedRequest, @Param('sceneId') sceneId: string) {
    return this.exportsService.listSceneExports(req.user.sub, sceneId);
  }

  @Get('exports/:exportId')
  @ApiOperation({ summary: 'Export 단건 조회' })
  getExport(@Req() req: AuthenticatedRequest, @Param('exportId') exportId: string) {
    return this.exportsService.getExport(req.user.sub, exportId);
  }

  @Get('exports/:exportId/download')
  @ApiOperation({ summary: 'Export 파일 다운로드(GLB)' })
  @Header('Content-Type', 'model/gltf-binary')
  async download(
    @Req() req: AuthenticatedRequest,
    @Param('exportId') exportId: string,
    @Res() res: { setHeader(name: string, value: string): void; send(data: Buffer): void }
  ) {
    const file = await this.exportsService.getDownloadFile(req.user.sub, exportId);

    if (!file) {
      throw new NotFoundException('Export file not found');
    }

    res.setHeader('Content-Disposition', `attachment; filename="scene-${exportId}.glb"`);
    res.setHeader('Content-Length', String(file.length));
    res.send(file);
  }
}
