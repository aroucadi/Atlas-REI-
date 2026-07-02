import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EvidenceModule } from '../evidence/evidence.module';
import { DailyBriefService } from './daily-brief.service';
import { DailyBriefController } from './daily-brief.controller';

@Module({
  imports: [DatabaseModule, EvidenceModule],
  controllers: [DailyBriefController],
  providers: [DailyBriefService],
  exports: [DailyBriefService],
})
export class DailyBriefModule {}
