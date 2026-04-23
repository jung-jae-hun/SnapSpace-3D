import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObjectDefinitionDto } from './dto/create-object-definition.dto';
import { UpdateObjectDefinitionDto } from './dto/update-object-definition.dto';

@Injectable()
export class ObjectDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  create(dto: CreateObjectDefinitionDto) {
    const data: Prisma.ObjectDefinitionCreateInput = {
      code: dto.code,
      name: dto.name,
      category: dto.category,
      tags: dto.tags ?? [],
      modelAssetId: dto.modelAssetId,
      thumbnailAssetId: dto.thumbnailAssetId,
      defaultSize: dto.defaultSize as Prisma.InputJsonValue | undefined,
      pivot: dto.pivot,
      allowedRotations: dto.allowedRotations ?? [],
      sockets: dto.sockets as Prisma.InputJsonValue | undefined,
      placementRules: dto.placementRules as Prisma.InputJsonValue | undefined,
      scalable: dto.scalable as Prisma.InputJsonValue | undefined
    };

    return this.prisma.objectDefinition.create({
      data
    });
  }

  findAll(category?: string) {
    return this.prisma.objectDefinition.findMany({
      where: category ? { category } : undefined,
      orderBy: { createdAt: 'desc' }
    });
  }

  async findOne(id: string) {
    const entity = await this.prisma.objectDefinition.findUnique({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Object definition not found');
    }
    return entity;
  }

  async update(id: string, dto: UpdateObjectDefinitionDto) {
    await this.findOne(id);

    const data: Prisma.ObjectDefinitionUpdateInput = {
      code: dto.code,
      name: dto.name,
      category: dto.category,
      tags: dto.tags,
      modelAssetId: dto.modelAssetId,
      thumbnailAssetId: dto.thumbnailAssetId,
      defaultSize: dto.defaultSize as Prisma.InputJsonValue | undefined,
      pivot: dto.pivot,
      allowedRotations: dto.allowedRotations,
      sockets: dto.sockets as Prisma.InputJsonValue | undefined,
      placementRules: dto.placementRules as Prisma.InputJsonValue | undefined,
      scalable: dto.scalable as Prisma.InputJsonValue | undefined
    };

    return this.prisma.objectDefinition.update({
      where: { id },
      data
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.objectDefinition.delete({ where: { id } });
    return { ok: true };
  }
}
