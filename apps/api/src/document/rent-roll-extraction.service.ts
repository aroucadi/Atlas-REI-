import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';
import {
  RentRollExtractionSchema,
  RentRollExtraction,
} from '@atlas/ai-gateway';
import { DocumentService } from './document.service';

export interface ExtractRentRollOptions {
  documentId: string;
  workspaceId: string;
  requestedByUserId: string;
  forceReextract?: boolean;
  extractorVersion?: string;
}

const DEFAULT_EXTRACTOR_VERSION = 'rent-roll-extract-v1';

const RENT_ROLL_SYSTEM_PROMPT = `
You are extracting structured data from a multifamily rent roll document.
Rules:
- Never guess. If a field is not present or illegible, return null — do not
  infer a plausible value.
- For every field you DO populate, include the sourceSpan reference id that
  points to the exact location in the source document where you found it.
  If you cannot confidently locate the span, set spanId to null even if you
  are confident in the value itself.
- Dates must be normalized to ISO 8601 (YYYY-MM-DD).
- Currency amounts must be plain decimal numbers with no symbols or commas.
- Score rowConfidence conservatively: reserve 0.9+ for rows with no
  ambiguity, illegibility, or conflicting figures.
`.trim();

@Injectable()
export class RentRollExtractionService {
  private readonly logger = new Logger(RentRollExtractionService.name);
  private readonly aiGateway: AiGateway;

  constructor(
    private readonly db: DatabaseService,
    private readonly documentService: DocumentService,
  ) {
    this.aiGateway = new AiGateway();
  }

  async extract(options: ExtractRentRollOptions) {
    const {
      documentId,
      workspaceId,
      requestedByUserId,
      forceReextract = false,
      extractorVersion = DEFAULT_EXTRACTOR_VERSION,
    } = options;

    // 1. Load and validate the document belongs to this workspace.
    const document = await this.db.client.document.findFirst({
      where: { id: documentId, workspaceId },
    });

    if (!document) {
      throw new NotFoundException(
        `Document ${documentId} not found in workspace ${workspaceId}`,
      );
    }

    if (document.documentType !== 'rent_roll') {
      throw new BadRequestException(
        `Document ${documentId} is type "${document.documentType}", expected "rent_roll"`,
      );
    }

    // 2. Short-circuit if a completed extraction already exists for this
    //    extractor version, unless the caller explicitly wants a re-run.
    if (!forceReextract) {
      const existing = await this.db.client.documentExtraction.findFirst({
        where: { documentId, extractorVersion },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) {
        this.logger.log(
          `Reusing existing extraction ${existing.id} for document ${documentId}`,
        );
        return existing;
      }
    }

    // 3. Fetch the OCR'd / raw text content for the document.
    const documentText = await this.documentService.getDocumentText(document);

    if (!documentText || documentText.trim().length === 0) {
      throw new BadRequestException(
        `Document ${documentId} has no extracted text available. Has OCR completed?`,
      );
    }

    // 4. Call the AI Gateway with the Zod schema as the structured-output contract.
    let result: RentRollExtraction;

    const aiRun = await this.db.client.aiRun.create({
      data: {
        workspaceId,
        jobType: 'rent_roll_extraction',
        modelProvider: 'pending',
        modelName: 'pending',
        promptVersion: extractorVersion,
        inputRefJson: { documentId } as any,
        status: 'running',
      },
    });

    try {
      const prompt = `Extract rent roll details from file content:\n\n${documentText}`;
      result = await this.aiGateway.generateStructuredJson<RentRollExtraction>(
        prompt,
        RentRollExtractionSchema,
        RENT_ROLL_SYSTEM_PROMPT,
      );
    } catch (err) {
      await this.db.client.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: 'failed',
          errorMessage: (err as Error).message,
          outputRefJson: { error: (err as Error).message } as any,
        },
      });
      this.logger.error(
        `AI Gateway extraction failed for document ${documentId}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Rent roll extraction failed');
    }

    await this.db.client.aiRun.update({
      where: { id: aiRun.id },
      data: {
        status: 'completed',
        modelProvider: 'gemini',
        modelName: 'gemini-1.5-pro',
        costEstimate: 0.0,
        outputRefJson: { unitCount: result.units?.length || 0 } as any,
      },
    });

    // 5. Build a per-field confidence map.
    const confidenceJson = this.buildConfidenceMap(result);

    // 6. Extract flat list of span IDs.
    const flatSpanIds = this.extractSpans(result);

    // 7. Persist to document_extractions.
    const extraction = await this.db.client.documentExtraction.create({
      data: {
        documentId,
        extractorVersion,
        fieldsJson: result as any,
        confidenceJson: confidenceJson as any,
        missingItemsJson: result.missingItems || [],
        sourceSpansJson: flatSpanIds as any,
      },
    });

    // 8. Audit log entry.
    const workspace = await this.db.client.workspace.findUnique({ where: { id: workspaceId } });
    await this.db.client.auditLog.create({
      data: {
        organizationId: workspace?.organizationId || null,
        workspaceId,
        actorUserId: requestedByUserId,
        entityType: 'document_extraction',
        entityId: extraction.id,
        action: 'created',
        afterJson: { extractorVersion, unitCount: result.units?.length || 0 } as any,
      },
    });

    return extraction;
  }

  private buildConfidenceMap(
    data: RentRollExtraction,
  ): Record<string, any> {
    const rowScores = (data.units || []).map((unit: any) => ({
      unitNumber: unit.unitNumber?.value || 'unknown',
      confidence: unit.rowConfidence || 0,
    }));

    const aggregate =
      rowScores.length === 0
        ? 0
        : rowScores.reduce((sum: number, r: any) => sum + r.confidence, 0) / rowScores.length;

    const lowConfidenceUnits = rowScores
      .filter((r: any) => r.confidence < 0.7)
      .map((r: any) => r.unitNumber);

    return {
      documentAggregateConfidence: aggregate,
      perUnit: rowScores,
      lowConfidenceUnits,
    };
  }

  private extractSpans(data: RentRollExtraction): string[] {
    const spans: string[] = [];
    if (data.propertyName?.spanId) spans.push(data.propertyName.spanId);
    if (data.rentRollAsOfDate?.spanId) spans.push(data.rentRollAsOfDate.spanId);
    if (data.totalUnitCount?.spanId) spans.push(data.totalUnitCount.spanId);
    
    for (const unit of data.units ?? []) {
      if (unit.unitNumber?.spanId) spans.push(unit.unitNumber.spanId);
      if (unit.unitType?.spanId) spans.push(unit.unitType.spanId);
      if (unit.bedrooms?.spanId) spans.push(unit.bedrooms.spanId);
      if (unit.bathrooms?.spanId) spans.push(unit.bathrooms.spanId);
      if (unit.squareFootage?.spanId) spans.push(unit.squareFootage.spanId);
      if (unit.tenantName?.spanId) spans.push(unit.tenantName.spanId);
      if (unit.leaseStartDate?.spanId) spans.push(unit.leaseStartDate.spanId);
      if (unit.leaseEndDate?.spanId) spans.push(unit.leaseEndDate.spanId);
      if (unit.moveInDate?.spanId) spans.push(unit.moveInDate.spanId);
      if (unit.monthlyBaseRent?.spanId) spans.push(unit.monthlyBaseRent.spanId);
      if (unit.marketRent?.spanId) spans.push(unit.marketRent.spanId);
      if (unit.securityDeposit?.spanId) spans.push(unit.securityDeposit.spanId);
      if (unit.pastDueBalance?.spanId) spans.push(unit.pastDueBalance.spanId);
    }
    return spans;
  }
}
