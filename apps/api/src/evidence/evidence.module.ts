import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { EvidenceService } from './evidence.service';
import { EvidenceController } from './evidence.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}
