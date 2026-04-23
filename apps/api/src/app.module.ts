import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ProjectsModule } from './projects/projects.module';
import { ScenesModule } from './scenes/scenes.module';
import { PrismaModule } from './prisma/prisma.module';
import { AssetsModule } from './assets/assets.module';

@Module({
  imports: [PrismaModule, AuthModule, ProjectsModule, ScenesModule, AssetsModule]
})
export class AppModule {}
