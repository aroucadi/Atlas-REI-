import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';

@Injectable()
export class EmbeddingService {
  private readonly aiGateway: AiGateway;

  constructor(private readonly db: DatabaseService) {
    this.aiGateway = new AiGateway();
  }

  async generateEmbedding(text: string): Promise<number[]> {
    return this.aiGateway.generateEmbedding(text);
  }

  async chunkAndEmbedDocument(documentId: string, text: string): Promise<void> {
    const chunkSize = 500;
    const overlap = 100;
    const chunks: { content: string; pageNumber: number }[] = [];

    let start = 0;
    let page = 1;

    while (start < text.length) {
      const content = text.slice(start, start + chunkSize);
      chunks.push({ content, pageNumber: page });

      if (chunks.length % 3 === 0) {
        page++;
      }

      start += chunkSize - overlap;
      if (text.length - start <= overlap) {
        // Grab final remainder if significant
        const remainder = text.slice(start);
        if (remainder.trim().length > 10) {
          chunks.push({ content: remainder, pageNumber: page });
        }
        break;
      }
    }

    for (const chunk of chunks) {
      const embedding = await this.generateEmbedding(chunk.content);
      const embeddingStr = `[${embedding.join(',')}]`;

      await this.db.client.$executeRawUnsafe(
        `INSERT INTO document_chunks (id, document_id, content, embedding, page_number, created_at)
         VALUES (gen_random_uuid(), $1::uuid, $2, $3::vector, $4, NOW())`,
        documentId,
        chunk.content,
        embeddingStr,
        chunk.pageNumber,
      );
    }
  }

  async semanticSearch(
    workspaceId: string,
    query: string,
    limit = 5,
  ): Promise<any[]> {
    const embedding = await this.generateEmbedding(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    // Query chunks gating by workspaceId
    const results = await this.db.client.$queryRawUnsafe<any[]>(
      `SELECT dc.id, dc.document_id as "documentId", dc.content, dc.page_number as "pageNumber",
              (dc.embedding <=> $1::vector) as distance,
              d.file_name as "fileName"
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       WHERE d.workspace_id = $2::uuid
       ORDER BY distance ASC
       LIMIT $3`,
      embeddingStr,
      workspaceId,
      limit,
    );

    return results.map((r) => ({
      id: r.id,
      documentId: r.documentId,
      content: r.content,
      pageNumber: r.pageNumber,
      score: 1 - Number(r.distance),
      fileName: r.fileName,
    }));
  }
}
