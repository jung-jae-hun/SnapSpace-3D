import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { BulkUpsertPlacedObjectsDto } from './dto/bulk-upsert-placed-objects.dto';
import { CreatePlacedObjectDto } from './dto/create-placed-object.dto';
import { UpdatePlacedObjectDto } from './dto/update-placed-object.dto';

@Injectable()
export class PlacedObjectsService {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureScene(sceneId: string) {
    const scene = await this.prisma.scene.findUnique({ where: { id: sceneId } });
    if (!scene) {
      throw new NotFoundException('Scene not found');
    }
  }

  async create(sceneId: string, dto: CreatePlacedObjectDto) {
    await this.ensureScene(sceneId);

    const data: Prisma.PlacedObjectCreateInput = {
      scene: { connect: { id: sceneId } },
      objectDefinition: { connect: { id: dto.objectDefinitionId } },
      name: dto.name,
      position: dto.position as Prisma.InputJsonValue,
      rotationY: dto.rotationY ?? 0,
      scale: dto.scale as Prisma.InputJsonValue,
      params: dto.params as Prisma.InputJsonValue | undefined
    };

    return this.prisma.placedObject.create({
      data
    });
  }

  async findByScene(sceneId: string) {
    await this.ensureScene(sceneId);

    return this.prisma.placedObject.findMany({
      where: { sceneId },
      orderBy: { createdAt: 'asc' }
    });
  }

  async update(sceneId: string, id: string, dto: UpdatePlacedObjectDto) {
    await this.ensureScene(sceneId);

    const found = await this.prisma.placedObject.findFirst({
      where: { id, sceneId }
    });

    if (!found) {
      throw new NotFoundException('Placed object not found');
    }

    const data: Prisma.PlacedObjectUncheckedUpdateInput = {
      objectDefinitionId: dto.objectDefinitionId,
      name: dto.name,
      position: dto.position as Prisma.InputJsonValue | undefined,
      rotationY: dto.rotationY,
      scale: dto.scale as Prisma.InputJsonValue | undefined,
      params: dto.params as Prisma.InputJsonValue | undefined
    };

    return this.prisma.placedObject.update({
      where: { id },
      data
    });
  }

  async remove(sceneId: string, id: string) {
    await this.ensureScene(sceneId);

    const found = await this.prisma.placedObject.findFirst({
      where: { id, sceneId }
    });

    if (!found) {
      throw new NotFoundException('Placed object not found');
    }

    await this.prisma.placedObject.delete({ where: { id } });
    return { ok: true };
  }

  async bulkUpsert(sceneId: string, dto: BulkUpsertPlacedObjectsDto) {
    await this.ensureScene(sceneId);

    const mode = dto.mode ?? 'replace';

    if (mode === 'replace') {
      await this.prisma.placedObject.deleteMany({ where: { sceneId } });

      if (dto.items.length === 0) {
        return { count: 0, mode };
      }

      const created = await this.prisma.$transaction(
        dto.items.map((item) =>
          this.prisma.placedObject.create({
            data: {
              id: item.id,
              scene: { connect: { id: sceneId } },
              objectDefinition: { connect: { id: item.objectDefinitionId } },
              name: item.name,
              position: item.position as Prisma.InputJsonValue,
              rotationY: item.rotationY ?? 0,
              scale: item.scale as Prisma.InputJsonValue,
              params: item.params as Prisma.InputJsonValue | undefined
            }
          })
        )
      );

      return { count: created.length, mode };
    }

    const requestedIds = dto.items
      .map((item) => item.id)
      .filter((id): id is string => Boolean(id));

    if (requestedIds.length > 0) {
      const existingInScene = await this.prisma.placedObject.findMany({
        where: {
          sceneId,
          id: { in: requestedIds }
        },
        select: { id: true }
      });

      const existingIdSet = new Set(existingInScene.map((item) => item.id));
      const missingInScene = requestedIds.find((id) => !existingIdSet.has(id));

      if (missingInScene) {
        throw new NotFoundException('Placed object not found in scene');
      }
    }

    const result = await this.prisma.$transaction(
      dto.items.map((item) =>
        item.id
          ? this.prisma.placedObject.upsert({
              where: { id: item.id },
              update: {
                objectDefinitionId: item.objectDefinitionId,
                name: item.name,
                position: item.position as Prisma.InputJsonValue,
                rotationY: item.rotationY ?? 0,
                scale: item.scale as Prisma.InputJsonValue,
                params: item.params as Prisma.InputJsonValue | undefined
              },
              create: {
                id: item.id,
                scene: { connect: { id: sceneId } },
                objectDefinition: { connect: { id: item.objectDefinitionId } },
                name: item.name,
                position: item.position as Prisma.InputJsonValue,
                rotationY: item.rotationY ?? 0,
                scale: item.scale as Prisma.InputJsonValue,
                params: item.params as Prisma.InputJsonValue | undefined
              }
            })
          : this.prisma.placedObject.create({
              data: {
                scene: { connect: { id: sceneId } },
                objectDefinition: { connect: { id: item.objectDefinitionId } },
                name: item.name,
                position: item.position as Prisma.InputJsonValue,
                rotationY: item.rotationY ?? 0,
                scale: item.scale as Prisma.InputJsonValue,
                params: item.params as Prisma.InputJsonValue | undefined
              }
            })
      )
    );

    return { count: result.length, mode };
  }
}
