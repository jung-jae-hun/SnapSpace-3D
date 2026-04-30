import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { ScenesModule } from './scenes/scenes.module';
import { PrismaModule } from './prisma/prisma.module';
import { AssetsModule } from './assets/assets.module';
import { ObjectDefinitionsModule } from './object-definitions/object-definitions.module';
import { PlacedObjectsModule } from './placed-objects/placed-objects.module';
import { ArrangeModule } from './arrange/arrange.module';
import { ExportsModule } from './exports/exports.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    ProjectsModule,
    ScenesModule,
    ArrangeModule,
    ExportsModule,
    AssetsModule,
    ObjectDefinitionsModule,
    PlacedObjectsModule
  ],
  controllers: [HealthController]
})
export class AppModule {}
