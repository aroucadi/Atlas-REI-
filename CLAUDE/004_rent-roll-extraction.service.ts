// apps/api/src/documents/rent-roll-extraction.service.ts
//
// Wires the RentRollExtractionSchema (packages/ai-gateway) into the
// document extraction pipeline. Assumes:
//   - a DocumentsService/Repository already resolves raw OCR text for a
//     document (you already have `documents` + presumably an OCR step
//     upstream of this — this service consumes that output, doesn't produce it)
//   - PrismaService is the standard injectable wrapper around PrismaClient
//   - @atlas/ai-gateway exports an injectable AiGatewayService with
//     generateStructuredJson(...)

import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiGatewayService } from '@atlas/ai-gateway';
import {
  RentRollExtractionSchema,
  RentRollExtraction,
} from '@atlas/ai-gateway/schemas/rentRoll.schema';
import { DocumentsService } from './documents.service';

export interface ExtractRentRollOptions {
  documentId: string;
  workspaceId: string;
  requestedByUserId: string;
  /** Force re-extraction even if a completed extraction already exists. */
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiGateway: AiGatewayService,
    private readonly documentsService: DocumentsService,
  ) {}

  async extract(options: ExtractRentRollOptions) {
    const {
      documentId,
      workspaceId,
      requestedByUserId,
      forceReextract = false,
      extractorVersion = DEFAULT_EXTRACTOR_VERSION,
    } = options;

    // 1. Load and validate the document belongs to this workspace.
    const document = await this.prisma.document.findFirst({
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
    //    extractor version, unless the caller explicitly wants a re-run
    //    (e.g. after a prompt/model upgrade).
    if (!forceReextract) {
      const existing = await this.prisma.documentExtraction.findFirst({
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
    //    Adjust this call to whatever your actual OCR/ingestion pipeline
    //    exposes — this assumes DocumentsService centralizes storage access.
    const documentText = await this.documentsService.getExtractedText(document);

    if (!documentText || documentText.trim().length === 0) {
      throw new BadRequestException(
        `Document ${documentId} has no extracted text available. Has OCR completed?`,
      );
    }

    // 4. Call the AI Gateway with the Zod schema as the structured-output
    //    contract.
    let result: {
      data: RentRollExtraction;
      sourceSpans: Array<{ id: string; page: number; byteStart: number; byteEnd: number; snippet: string }>;
      modelProvider: string;
      modelName: string;
      costEstimate?: number;
    };

    const aiRun = await this.prisma.aiRun.create({
      data: {
        workspaceId,
        jobType: 'rent_roll_extraction',
        modelProvider: 'pending',
        modelName: 'pending',
        promptVersion: extractorVersion,
        inputRefJson: { documentId },
        status: 'running',
      },
    });

    try {
      result = await this.aiGateway.generateStructuredJson({
        schema: RentRollExtractionSchema,
        input: documentText,
        systemPrompt: RENT_ROLL_SYSTEM_PROMPT,
        promptVersion: extractorVersion,
        documentId: document.id,
      });
    } catch (err) {
      await this.prisma.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: 'failed',
          outputRefJson: { error: (err as Error).message },
        },
      });
      this.logger.error(
        `AI Gateway extraction failed for document ${documentId}: ${(err as Error).message}`,
      );
      throw new InternalServerErrorException('Rent roll extraction failed');
    }

    await this.prisma.aiRun.update({
      where: { id: aiRun.id },
      data: {
        status: 'completed',
        modelProvider: result.modelProvider,
        modelName: result.modelName,
        costEstimate: result.costEstimate,
        outputRefJson: { unitCount: result.data.units.length },
      },
    });

    // 5. Build a per-field confidence map. RentRollExtractionSchema carries
    //    row-level confidence; we surface both row-level and an aggregate
    //    document-level score so the UI can flag low-confidence rows
    //    without a full re-read of fieldsJson on every render.
    const confidenceJson = this.buildConfidenceMap(result.data);

    // 6. Persist to document_extractions. fieldsJson gets the full
    //    structured payload; sourceSpansJson gets the flat span list so
    //    the citation UI doesn't need to walk the nested unit tree to
    //    resolve a click-through.
    const extraction = await this.prisma.documentExtraction.create({
      data: {
        documentId,
        extractorVersion,
        fieldsJson: result.data as unknown as Record<string, unknown>,
        confidenceJson,
        missingItemsJson: result.data.missingItems,
        sourceSpansJson: result.sourceSpans,
      },
    });

    // 7. Audit log entry — this is a create-only insert per the WORM
    //    migration; there is no update/delete path for this table.
    await this.prisma.auditLog.create({
      data: {
        organizationId: document.workspaceId
          ? (await this.prisma.workspace.findUnique({ where: { id: workspaceId } }))?.organizationId
          : null,
        workspaceId,
        actorUserId: requestedByUserId,
        entityType: 'document_extraction',
        entityId: extraction.id,
        action: 'created',
        afterJson: { extractorVersion, unitCount: result.data.units.length },
      },
    });

    return extraction;
  }

  private buildConfidenceMap(
    data: RentRollExtraction,
  ): Record<string, unknown> {
    const rowScores = data.units.map((unit) => ({
      unitNumber: unit.unitNumber.value,
      confidence: unit.rowConfidence,
    }));

    const aggregate =
      rowScores.length === 0
        ? 0
        : rowScores.reduce((sum, r) => sum + r.confidence, 0) / rowScores.length;

    const lowConfidenceUnits = rowScores
      .filter((r) => r.confidence < 0.7)
      .map((r) => r.unitNumber);

    return {
      documentAggregateConfidence: aggregate,
      perUnit: rowScores,
      lowConfidenceUnits,
    };
  }
}
