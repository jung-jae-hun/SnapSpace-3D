import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateObjectDefinitionDto } from './dto/create-object-definition.dto';
import { UpdateObjectDefinitionDto } from './dto/update-object-definition.dto';

const LIFECYCLE_ACTIVE_TAG = 'lifecycle:active';
const LIFECYCLE_INACTIVE_TAG = 'lifecycle:inactive';
const LIFECYCLE_VERSION_PREFIX = 'lifecycle:version:';
const LIFECYCLE_FAMILY_PREFIX = 'lifecycle:family:';

@Injectable()
export class ObjectDefinitionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async logLifecycleEvent(input: {
    objectDefinitionId: string;
    action: 'activate' | 'deactivate' | 'new_version';
    actorUserId: string;
    details?: Record<string, unknown>;
  }) {
    return this.prisma.objectDefinitionLifecycleEvent.create({
      data: {
        objectDefinitionId: input.objectDefinitionId,
        action: input.action,
        actorUserId: input.actorUserId,
        details: (input.details ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });
  }

  private isLifecycleTag(tag: string) {
    return (
      tag === LIFECYCLE_ACTIVE_TAG ||
      tag === LIFECYCLE_INACTIVE_TAG ||
      tag.startsWith(LIFECYCLE_VERSION_PREFIX) ||
      tag.startsWith(LIFECYCLE_FAMILY_PREFIX)
    );
  }

  private getVersionFromTags(tags: string[]) {
    const found = tags.find((tag) => tag.startsWith(LIFECYCLE_VERSION_PREFIX));
    if (!found) {
      return undefined;
    }
    const parsed = Number(found.slice(LIFECYCLE_VERSION_PREFIX.length));
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
  }

  private getFamilyFromTags(tags: string[]) {
    const found = tags.find((tag) => tag.startsWith(LIFECYCLE_FAMILY_PREFIX));
    if (!found) {
      return undefined;
    }

    const family = found.slice(LIFECYCLE_FAMILY_PREFIX.length).trim();
    return family || undefined;
  }

  private isInactive(tags: string[]) {
    return tags.includes(LIFECYCLE_INACTIVE_TAG);
  }

  private mergeLifecycleTags(input: {
    tags: string[];
    fallbackFamily: string;
    fallbackVersion?: number;
    forceInactive?: boolean;
    forceActive?: boolean;
  }) {
    const nonLifecycle = input.tags.filter((tag) => tag && !this.isLifecycleTag(tag));
    const family = this.getFamilyFromTags(input.tags) ?? input.fallbackFamily;
    const version = this.getVersionFromTags(input.tags) ?? input.fallbackVersion ?? 1;

    let statusTag = LIFECYCLE_ACTIVE_TAG;
    if (input.forceInactive) {
      statusTag = LIFECYCLE_INACTIVE_TAG;
    } else if (input.forceActive) {
      statusTag = LIFECYCLE_ACTIVE_TAG;
    } else if (this.isInactive(input.tags)) {
      statusTag = LIFECYCLE_INACTIVE_TAG;
    }

    return [
      ...new Set([
        ...nonLifecycle,
        statusTag,
        `${LIFECYCLE_VERSION_PREFIX}${version}`,
        `${LIFECYCLE_FAMILY_PREFIX}${family}`
      ])
    ];
  }

  create(dto: CreateObjectDefinitionDto) {
    const mergedTags = this.mergeLifecycleTags({
      tags: dto.tags ?? [],
      fallbackFamily: dto.code,
      fallbackVersion: 1,
      forceActive: true
    });

    const data: Prisma.ObjectDefinitionCreateInput = {
      code: dto.code,
      name: dto.name,
      category: dto.category,
      tags: mergedTags,
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

  findAll(category?: string, includeInactive = false, source?: 'manual' | 'ai') {
    const where: Prisma.ObjectDefinitionWhereInput = {
      category: category || undefined,
      source: source || undefined
    };

    if (!includeInactive) {
      where.NOT = {
        tags: {
          has: LIFECYCLE_INACTIVE_TAG
        }
      };
    }

    return this.prisma.objectDefinition.findMany({
      where,
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

  async listLifecycleEvents(id: string, limit = 20) {
    await this.findOne(id);

    const safeLimit = Number.isFinite(limit)
      ? Math.max(1, Math.min(100, Math.floor(limit)))
      : 20;

    return this.prisma.objectDefinitionLifecycleEvent.findMany({
      where: { objectDefinitionId: id },
      orderBy: { createdAt: 'desc' },
      take: safeLimit
    });
  }

  async update(id: string, dto: UpdateObjectDefinitionDto) {
    const existing = await this.findOne(id);
    const tagsSource = dto.tags ?? existing.tags;
    const mergedTags = this.mergeLifecycleTags({
      tags: tagsSource,
      fallbackFamily: this.getFamilyFromTags(existing.tags) ?? existing.code,
      fallbackVersion: this.getVersionFromTags(existing.tags) ?? 1,
      forceInactive: this.isInactive(existing.tags),
      forceActive: !this.isInactive(existing.tags)
    });

    const data: Prisma.ObjectDefinitionUpdateInput = {
      code: dto.code,
      name: dto.name,
      category: dto.category,
      tags: mergedTags,
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

  async deactivate(
    id: string,
    actorUserId = 'system',
    details?: Record<string, unknown>
  ) {
    const existing = await this.findOne(id);
    const tags = this.mergeLifecycleTags({
      tags: existing.tags,
      fallbackFamily: this.getFamilyFromTags(existing.tags) ?? existing.code,
      fallbackVersion: this.getVersionFromTags(existing.tags) ?? 1,
      forceInactive: true
    });

    const updated = await this.prisma.objectDefinition.update({
      where: { id },
      data: {
        tags
      }
    });

    await this.logLifecycleEvent({
      objectDefinitionId: id,
      action: 'deactivate',
      actorUserId,
      details
    });

    return updated;
  }

  async activate(id: string, actorUserId = 'system', details?: Record<string, unknown>) {
    const existing = await this.findOne(id);
    const tags = this.mergeLifecycleTags({
      tags: existing.tags,
      fallbackFamily: this.getFamilyFromTags(existing.tags) ?? existing.code,
      fallbackVersion: this.getVersionFromTags(existing.tags) ?? 1,
      forceActive: true
    });

    const updated = await this.prisma.objectDefinition.update({
      where: { id },
      data: {
        tags
      }
    });

    await this.logLifecycleEvent({
      objectDefinitionId: id,
      action: 'activate',
      actorUserId,
      details
    });

    return updated;
  }

  async createNewVersion(id: string, actorUserId = 'system') {
    const existing = await this.findOne(id);
    const family = this.getFamilyFromTags(existing.tags) ?? existing.code;
    const currentVersion = this.getVersionFromTags(existing.tags) ?? 1;
    const nextVersion = currentVersion + 1;

    const baseCode = existing.code.replace(/-v\d+$/, '');
    let candidateVersion = nextVersion;
    let nextCode = `${baseCode}-v${candidateVersion}`;
    // Ensure code uniqueness while keeping predictable version suffix.
    while (await this.prisma.objectDefinition.findUnique({ where: { code: nextCode } })) {
      candidateVersion += 1;
      nextCode = `${baseCode}-v${candidateVersion}`;
    }

    const nextTags = this.mergeLifecycleTags({
      tags: existing.tags,
      fallbackFamily: family,
      fallbackVersion: candidateVersion,
      forceActive: true
    });

    const created = await this.prisma.objectDefinition.create({
      data: {
        code: nextCode,
        name: `${existing.name} v${candidateVersion}`,
        category: existing.category,
        tags: nextTags,
        modelAssetId: existing.modelAssetId,
        thumbnailAssetId: existing.thumbnailAssetId,
        defaultSize: existing.defaultSize as Prisma.InputJsonValue | undefined,
        pivot: existing.pivot,
        allowedRotations: existing.allowedRotations,
        sockets: existing.sockets as Prisma.InputJsonValue | undefined,
        placementRules: existing.placementRules as Prisma.InputJsonValue | undefined,
        scalable: existing.scalable as Prisma.InputJsonValue | undefined,
        source: existing.source,
        sourceGenerationAssetId: existing.sourceGenerationAssetId
      }
    });

    await this.logLifecycleEvent({
      objectDefinitionId: created.id,
      action: 'new_version',
      actorUserId,
      details: {
        fromObjectDefinitionId: id,
        version: candidateVersion
      }
    });

    await this.deactivate(id, actorUserId, {
      reason: 'superseded_by_new_version',
      newObjectDefinitionId: created.id
    });

    return {
      previousId: id,
      created
    };
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.objectDefinition.delete({ where: { id } });
    return { ok: true };
  }
}
