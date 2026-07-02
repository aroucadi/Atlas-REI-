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
const MIN_VIABLE_TEXT_LENGTH = 50;

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

    // Hardened check 1: Empty or garbage OCR text
    if (!documentText || documentText.trim().length < MIN_VIABLE_TEXT_LENGTH) {
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'insufficient_ocr_text',
        textLength: documentText?.trim().length ?? 0,
      });
      throw new BadRequestException(
        `Document ${documentId} has insufficient extracted text (` +
          `${documentText?.trim().length ?? 0} characters). OCR may have failed, ` +
          `or this may be a scanned document requiring re-processing. ` +
          `Try re-uploading a higher-quality scan.`,
      );
    }

    // 4. Call the AI Gateway with the Zod schema as the structured-output contract.
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

    let rawResult: any;
    try {
      const prompt = `Extract rent roll details from file content:\n\n${documentText}`;
      rawResult = await this.aiGateway.generateStructuredJson<RentRollExtraction>(
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
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'ai_gateway_error',
        message: (err as Error).message,
      });
      this.logger.error(
        `AI Gateway extraction failed for document ${documentId}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Rent roll extraction failed');
    }

    // Hardened check 2: Validate against Zod schema safely
    const parsed = RentRollExtractionSchema.safeParse(rawResult);
    if (!parsed.success) {
      await this.db.client.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: 'failed',
          errorMessage: parsed.error.message,
          outputRefJson: { error: 'schema_validation_failed', zodError: parsed.error.format() } as any,
        },
      });
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'schema_validation_failed',
        zodError: parsed.error.issues.slice(0, 10) as any,
      });
      this.logger.error(
        `Rent roll extraction returned schema-invalid data for document ${documentId}: ${parsed.error.message}`,
      );
      throw new InternalServerErrorException(
        'Extraction returned an unexpected format. This has been logged for review.',
      );
    }

    const data = parsed.data;

    // Hardened check 3: Substantively empty result (zero units)
    if ((data.units || []).length === 0) {
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'zero_units_extracted',
        missingItems: data.missingItems || [],
      });
      throw new BadRequestException(
        'Zero units extracted from document. Confirm format and try re-uploading.',
      );
    }

    await this.db.client.aiRun.update({
      where: { id: aiRun.id },
      data: {
        status: 'completed',
        modelProvider: 'gemini',
        modelName: 'gemini-1.5-pro',
        costEstimate: 0.0,
        outputRefJson: { unitCount: data.units.length } as any,
      },
    });

    // 5. Build a per-field confidence map.
    const confidenceJson = this.buildConfidenceMap(data);

    // 6. Extract flat list of span IDs.
    const flatSpanIds = this.extractSpans(data);

    // 7. Persist to document_extractions.
    const extraction = await this.db.client.documentExtraction.create({
      data: {
        documentId,
        extractorVersion,
        fieldsJson: data as any,
        confidenceJson: confidenceJson as any,
        missingItemsJson: data.missingItems || [],
        sourceSpansJson: flatSpanIds as any,
        status: 'completed',
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
        afterJson: { extractorVersion, unitCount: data.units.length } as any,
      },
    });

    return extraction;
  }

  private async recordFailedExtraction(
    document: { id: string },
    workspaceId: string,
    actorUserId: string,
    extractorVersion: string,
    failureDetail: Record<string, any>,
  ) {
    const workspace = await this.db.client.workspace.findUnique({ where: { id: workspaceId } });
    await this.db.client.documentExtraction.create({
      data: {
        documentId: document.id,
        extractorVersion,
        fieldsJson: { units: [], missingItems: ['ALL_FIELDS'] } as any,
        confidenceJson: { documentAggregateConfidence: 0, perUnit: [], lowConfidenceUnits: [] } as any,
        missingItemsJson: ['ALL_FIELDS'] as any,
        sourceSpansJson: [] as any,
        status: 'failed',
        failureDetailJson: failureDetail as any,
      },
    });

    await this.db.client.auditLog.create({
      data: {
        organizationId: workspace?.organizationId || null,
        workspaceId,
        actorUserId,
        entityType: 'document_extraction',
        entityId: document.id,
        action: 'extraction_failed',
        afterJson: failureDetail as any,
      },
    });
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
