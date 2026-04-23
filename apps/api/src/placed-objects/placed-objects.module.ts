import { Module } from '@nestjs/common';
import { PlacedObjectsController } from './placed-objects.controller';
import { PlacedObjectsService } from './placed-objects.service';

@Module({
  controllers: [PlacedObjectsController],
  providers: [PlacedObjectsService]
})
export class PlacedObjectsModule {}
