import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { DealFinderService } from './deal-finder.service';
import { DealFinderController } from './deal-finder.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [DealFinderController],
  providers: [DealFinderService],
  exports: [DealFinderService],
})
export class DealFinderModule {}
