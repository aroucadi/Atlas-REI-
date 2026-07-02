import { Module } from '@nestjs/common';
import { DocumentController } from './document.controller';
import { DocumentService } from './document.service';
import { EmbeddingService } from './embedding.service';
import { EvidenceModule } from '../evidence/evidence.module';

@Module({
  imports: [EvidenceModule],
  controllers: [DocumentController],
  providers: [DocumentService, EmbeddingService],
  exports: [DocumentService, EmbeddingService],
})
export class DocumentModule {}
