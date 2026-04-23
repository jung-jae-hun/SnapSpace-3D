import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ScenesController } from './scenes.controller';
import { ScenesService } from './scenes.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ScenesController],
  providers: [ScenesService]
})
export class ScenesModule {}
