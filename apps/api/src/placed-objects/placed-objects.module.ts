import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { PlacedObjectsController } from './placed-objects.controller';
import { PlacedObjectsService } from './placed-objects.service';

@Module({
  imports: [AuthModule, PrismaModule],
  controllers: [PlacedObjectsController],
  providers: [PlacedObjectsService]
})
export class PlacedObjectsModule {}
