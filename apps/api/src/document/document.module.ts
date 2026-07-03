import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { EmbeddingService } from './embedding.service';
import { EvidenceModule } from '../evidence/evidence.module';
import { RentRollExtractionService } from './rent-roll-extraction.service';
import { T12ExtractionService } from './t12-extraction.service';

@Module({
  imports: [EvidenceModule],
  controllers: [DocumentController],
  providers: [
    DocumentService,
    EmbeddingService,
    RentRollExtractionService,
    T12ExtractionService,
  ],
  exports: [
    DocumentService,
    EmbeddingService,
    RentRollExtractionService,
    T12ExtractionService,
  ],
})
export class DocumentModule {}
