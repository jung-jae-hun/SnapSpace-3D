import { Module } from '@nestjs/common';
import { ArrangeController } from './arrange.controller';
import { ArrangeService } from './arrange.service';

@Module({
  controllers: [ArrangeController],
  providers: [ArrangeService]
})
export class ArrangeModule {}
