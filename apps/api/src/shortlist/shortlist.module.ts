import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ShortlistService } from './shortlist.service';
import { ShortlistController } from './shortlist.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [ShortlistController],
  providers: [ShortlistService],
  exports: [ShortlistService],
})
export class ShortlistModule {}
