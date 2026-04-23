import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ArrangeController } from './arrange.controller';
import { ArrangeService } from './arrange.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ArrangeController],
  providers: [ArrangeService]
})
export class ArrangeModule {}
