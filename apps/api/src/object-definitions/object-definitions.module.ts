import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ObjectDefinitionsController } from './object-definitions.controller';
import { ObjectDefinitionsService } from './object-definitions.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [ObjectDefinitionsController],
  providers: [ObjectDefinitionsService]
})
export class ObjectDefinitionsModule {}
