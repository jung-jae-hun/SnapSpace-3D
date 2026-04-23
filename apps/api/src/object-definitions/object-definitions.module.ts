import { Module } from '@nestjs/common';
import { ObjectDefinitionsController } from './object-definitions.controller';
import { ObjectDefinitionsService } from './object-definitions.service';

@Module({
  controllers: [ObjectDefinitionsController],
  providers: [ObjectDefinitionsService]
})
export class ObjectDefinitionsModule {}
