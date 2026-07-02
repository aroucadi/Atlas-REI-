import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { EmbeddingService } from './embedding.service';
import { EvidenceModule } from '../evidence/evidence.module';
import { RentRollExtractionService } from './rent-roll-extraction.service';

@Module({
  imports: [EvidenceModule],
  controllers: [DocumentController],
  providers: [DocumentService, EmbeddingService, RentRollExtractionService],
  exports: [DocumentService, EmbeddingService, RentRollExtractionService],
})
export class DocumentModule {}
