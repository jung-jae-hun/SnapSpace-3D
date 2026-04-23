import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ArrangeSceneDto } from './dto/arrange-scene.dto';

type Vec3 = { x: number; y: number; z: number };

type ArrangedObject = {
  id: string;
  position: Vec3;
};

type GeneratedObject = {
  id: string;
  sourcePlacedObjectId: string;
  meshType: string;
  assetId?: string;
  position: Vec3;
  rotation: Vec3;
  scale: Vec3;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ArrangeService {
  constructor(private readonly prisma: PrismaService) {}

  async run(userId: string, sceneId: string, dto: ArrangeSceneDto) {
    const scene = await this.prisma.scene.findFirst({
      where: {
        id: sceneId,
        project: { userId }
      }
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    const where: Prisma.PlacedObjectWhereInput = {
      sceneId,
      ...(dto.objectIds && dto.objectIds.length > 0
        ? { id: { in: dto.objectIds } }
        : {})
    };

    const placed = await this.prisma.placedObject.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    });

    const arranged = this.applyArrange(
      placed.map((item) => ({
        id: item.id,
        position: this.parsePosition(item.position)
      })),
      dto
    );

    await this.prisma.$transaction(
      arranged.map((item) =>
        this.prisma.placedObject.update({
          where: { id: item.id },
          data: {
            position: item.position as Prisma.InputJsonValue
          }
        })
      )
    );

    return {
      action: dto.action,
      sceneId,
      updatedCount: arranged.length
    };
  }

  async generate(userId: string, sceneId: string) {
    await this.findOwnedScene(userId, sceneId);

    const generated = await this.listGeneratedObjects(userId, sceneId);

    return {
      sceneId,
      generatedCount: generated.length,
      generatedObjects: generated
    };
  }

  async listGeneratedObjects(userId: string, sceneId: string) {
    await this.findOwnedScene(userId, sceneId);

    const placed = await this.prisma.placedObject.findMany({
      where: { sceneId },
      include: {
        objectDefinition: {
          select: {
            code: true,
            category: true,
            modelAssetId: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    return placed.map<GeneratedObject>((item) => ({
      id: `gen-${item.id}`,
      sourcePlacedObjectId: item.id,
      meshType: item.objectDefinition.code || item.objectDefinition.category || 'object',
      assetId: item.objectDefinition.modelAssetId ?? undefined,
      position: this.parsePosition(item.position),
      rotation: { x: 0, y: Number(item.rotationY ?? 0), z: 0 },
      scale: this.parseScale(item.scale),
      metadata: {
        category: item.objectDefinition.category,
        objectDefinitionId: item.objectDefinitionId,
        name: item.name ?? null
      }
    }));
  }

  private async findOwnedScene(userId: string, sceneId: string) {
    const scene = await this.prisma.scene.findFirst({
      where: {
        id: sceneId,
        project: { userId }
      }
    });

    if (!scene) {
      throw new NotFoundException('Scene not found');
    }

    return scene;
  }

  private applyArrange(items: ArrangedObject[], dto: ArrangeSceneDto): ArrangedObject[] {
    if (items.length === 0) {
      return items;
    }

    if (dto.action === 'align-x') {
      const avgX = items.reduce((sum, item) => sum + item.position.x, 0) / items.length;
      return items.map((item) => ({
        ...item,
        position: { ...item.position, x: Number(avgX.toFixed(4)) }
      }));
    }

    if (dto.action === 'align-z') {
      const avgZ = items.reduce((sum, item) => sum + item.position.z, 0) / items.length;
      return items.map((item) => ({
        ...item,
        position: { ...item.position, z: Number(avgZ.toFixed(4)) }
      }));
    }

    if (dto.action === 'space-x') {
      if (items.length < 3) {
        return items;
      }

      const sorted = [...items].sort((a, b) => a.position.x - b.position.x);
      const minX = sorted[0].position.x;
      const maxX = sorted[sorted.length - 1].position.x;
      const gap = (maxX - minX) / (sorted.length - 1);

      return sorted.map((item, idx) => ({
        ...item,
        position: {
          ...item.position,
          x: Number((minX + gap * idx).toFixed(4))
        }
      }));
    }

    const grid = dto.gridSize ?? 1;
    return items.map((item) => ({
      ...item,
      position: {
        ...item.position,
        x: Number((Math.round(item.position.x / grid) * grid).toFixed(4)),
        z: Number((Math.round(item.position.z / grid) * grid).toFixed(4))
      }
    }));
  }

  private parsePosition(value: unknown): Vec3 {
    const input = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

    return {
      x: Number(input.x ?? 0),
      y: Number(input.y ?? 0),
      z: Number(input.z ?? 0)
    };
  }

  private parseScale(value: unknown): Vec3 {
    const input = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

    return {
      x: Number(input.x ?? 1),
      y: Number(input.y ?? 1),
      z: Number(input.z ?? 1)
    };
  }
}
