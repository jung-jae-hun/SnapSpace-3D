import { Module } from '@nestjs/common';
import { AssetsModule } from '../assets/assets.module';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AiGenerationsController } from './ai-generations.controller';
import { AiGenerationWorker } from './ai-generation.worker';
import { AiProviderClient } from './ai-provider.client';
import { AiGenerationsService } from './ai-generations.service';

@Module({
  imports: [AuthModule, PrismaModule, AssetsModule],
  controllers: [AiGenerationsController],
  providers: [AiGenerationsService, AiGenerationWorker, AiProviderClient]
})
export class AiGenerationsModule {}
