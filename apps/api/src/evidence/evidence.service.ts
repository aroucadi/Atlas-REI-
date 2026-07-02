import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class EvidenceService {
  constructor(private readonly db: DatabaseService) {}

  async getEvidenceForWorkspace(workspaceId: string, propertyId?: string) {
    const whereClause: any = { workspaceId };
    if (propertyId) {
      whereClause.propertyId = propertyId;
    }
    return this.db.client.evidence.findMany({
      where: whereClause,
      orderBy: {
        freshness: 'desc',
      },
    });
  }

  async registerEvidence(
    workspaceId: string,
    data: {
      propertyId?: string | null;
      sourceType: string;
      sourceId: string;
      title: string;
      snippet?: string | null;
      confidence?: number | null;
      freshness?: Date | string | null;
      metadataJson?: any;
    },
  ) {
    const freshnessVal = data.freshness ? new Date(data.freshness) : new Date();
    return this.db.client.evidence.create({
      data: {
        workspaceId,
        propertyId: data.propertyId || null,
        sourceType: data.sourceType,
        sourceId: data.sourceId,
        title: data.title,
        snippet: data.snippet || null,
        confidence: data.confidence !== undefined ? data.confidence : null,
        freshness: freshnessVal,
        metadataJson: data.metadataJson || {},
      },
    });
  }
}
