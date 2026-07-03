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
  T12OperatingStatementSchema,
  T12OperatingStatement,
  computeBottomUpTotals,
} from '@atlas/ai-gateway';
import { DocumentService } from './document.service';

export interface ExtractT12Options {
  documentId: string;
  workspaceId: string;
  requestedByUserId: string;
  forceReextract?: boolean;
  extractorVersion?: string;
}

const DEFAULT_EXTRACTOR_VERSION = 't12-extract-v1';
const MIN_VIABLE_TEXT_LENGTH = 50;
// If the model's printed total differs from the bottom-up sum by more than
// this fraction, treat it as a reportable discrepancy rather than rounding
// noise (T-12s frequently have small rounding differences from month-end
// accrual timing — 0.5% tolerance avoids flagging those as "gaps").
const RECONCILIATION_TOLERANCE_PCT = 0.005;

const T12_SYSTEM_PROMPT = `
You are extracting structured monthly financial data from a multifamily
Trailing-12 (T-12) operating statement.
Rules:
- Extract exactly 12 monthly values per line item, in chronological order.
  If fewer than 12 months are present in the source, fill missing months
  with null — never fabricate a value.
- Extract "totals" fields (reportedTotals) only from rows the document
  itself explicitly labels as totals (e.g. "Total Income", "NOI",
  "Total Operating Expenses"). Do not compute these yourself.
- If the document itemizes an income or expense category not covered by a
  named field in the schema, place it in otherAncillaryIncome or
  otherExpenses with its own category label — do not force it into an
  unrelated named field.
- Include sourceSpan references for every populated field.
- Note in discrepancyNotes anything internally inconsistent in the source
  (e.g. a monthly column that doesn't sum to the row's own stated total).
`.trim();

export class ExtractionQualityError extends Error {
  constructor(public readonly reason: string, public readonly partialResult?: unknown) {
    super(`T-12 extraction produced insufficient results: ${reason}`);
    this.name = 'ExtractionQualityError';
  }
}

@Injectable()
export class T12ExtractionService {
  private readonly logger = new Logger(T12ExtractionService.name);
  private readonly aiGateway: AiGateway;

  constructor(
    private readonly db: DatabaseService,
    private readonly documentService: DocumentService,
  ) {
    this.aiGateway = new AiGateway();
  }

  async extract(options: ExtractT12Options) {
    const {
      documentId,
      workspaceId,
      requestedByUserId,
      forceReextract = false,
      extractorVersion = DEFAULT_EXTRACTOR_VERSION,
    } = options;

    const document = await this.db.client.document.findFirst({
      where: { id: documentId, workspaceId },
    });
    if (!document) {
      throw new NotFoundException(`Document ${documentId} not found in workspace ${workspaceId}`);
    }
    if (document.documentType !== 'operating_statement') {
      throw new BadRequestException(
        `Document ${documentId} is type "${document.documentType}", expected "operating_statement"`,
      );
    }

    if (!forceReextract) {
      const existing = await this.db.client.documentExtraction.findFirst({
        where: { documentId, extractorVersion },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    const documentText = await this.documentService.getDocumentText(document);
    if (!documentText || documentText.trim().length < MIN_VIABLE_TEXT_LENGTH) {
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'insufficient_ocr_text',
        textLength: documentText?.trim().length ?? 0,
      });
      throw new BadRequestException(
        `Document ${documentId} has insufficient extracted text. OCR may have failed or this may require re-scanning.`,
      );
    }

    const aiRun = await this.db.client.aiRun.create({
      data: {
        workspaceId,
        jobType: 't12_extraction',
        modelProvider: 'pending',
        modelName: 'pending',
        promptVersion: extractorVersion,
        inputRefJson: { documentId } as any,
        status: 'running',
      },
    });

    let rawResult: any;
    try {
      const prompt = `Extract Trailing-12 (T-12) operating statement details from file content:\n\n${documentText}`;
      rawResult = await this.aiGateway.generateStructuredJson<T12OperatingStatement>(
        prompt,
        T12OperatingStatementSchema,
        T12_SYSTEM_PROMPT,
      );
    } catch (err) {
      await this.db.client.aiRun.update({
        where: { id: aiRun.id },
        data: { status: 'failed', outputRefJson: { error: (err as Error).message } as any },
      });
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'ai_gateway_error',
        message: (err as Error).message,
      });
      this.logger.error(`AI Gateway call failed for T-12 document ${documentId}: ${(err as Error).message}`);
      throw new InternalServerErrorException('T-12 extraction failed');
    }

    const parsed = T12OperatingStatementSchema.safeParse(rawResult.data);
    if (!parsed.success) {
      await this.db.client.aiRun.update({
        where: { id: aiRun.id },
        data: { status: 'failed', outputRefJson: { error: 'schema_validation_failed', zodError: parsed.error.format() } as any },
      });
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'schema_validation_failed',
        zodError: parsed.error.issues.slice(0, 10),
      });
      this.logger.error(`T-12 extraction returned schema-invalid data for document ${documentId}: ${parsed.error.message}`);
      throw new InternalServerErrorException('Extraction returned an unexpected format. This has been logged for review.');
    }

    const data = parsed.data;

    await this.db.client.aiRun.update({
      where: { id: aiRun.id },
      data: {
        status: 'completed',
        modelProvider: rawResult.modelProvider,
        modelName: rawResult.modelName,
        costEstimate: rawResult.costEstimate,
        outputRefJson: { hasReportedTotals: data.reportedTotals.netOperatingIncome.value !== null } as any,
      },
    });

    // ---------------------------------------------------------------------
    // Reconciliation: bottom-up sum vs. the document's own printed totals.
    // ---------------------------------------------------------------------
    const computed = computeBottomUpTotals(data);
    const reconciliation = this.reconcileTotals(data, computed);

    if (
      data.income.grossPotentialRent.monthlyValues.every((v) => v === null) &&
      data.expenses.propertyTaxes.monthlyValues.every((v) => v === null)
    ) {
      await this.recordFailedExtraction(document, workspaceId, requestedByUserId, extractorVersion, {
        reason: 'zero_data_extracted',
        missingItems: data.missingItems,
      });
      throw new ExtractionQualityError('no usable income/expense data extracted', data);
    }

    const confidenceJson = this.buildConfidenceMap(data, reconciliation);

    const extraction = await this.db.client.documentExtraction.create({
      data: {
        documentId,
        extractorVersion,
        fieldsJson: data as any,
        confidenceJson: confidenceJson as any,
        missingItemsJson: data.missingItems as any,
        sourceSpansJson: rawResult.sourceSpans as any,
        status: 'completed',
      },
    });

    const workspace = await this.db.client.workspace.findUnique({ where: { id: workspaceId } });

    await this.db.client.auditLog.create({
      data: {
        organizationId: workspace?.organizationId,
        workspaceId,
        actorUserId: requestedByUserId,
        entityType: 'document_extraction',
        entityId: extraction.id,
        action: 'created',
        afterJson: {
          extractorVersion,
          reconciliationStatus: reconciliation.status,
        } as any,
      },
    });

    return extraction;
  }

  private reconcileTotals(
    data: T12OperatingStatement,
    computed: ReturnType<typeof computeBottomUpTotals>,
  ) {
    const reportedNoi = data.reportedTotals.netOperatingIncome.value;

    if (reportedNoi === null) {
      return { status: 'not_reported' as const, computed, reportedNoi: null, deltaPct: null };
    }

    const delta = Math.abs(reportedNoi - computed.netOperatingIncome);
    const deltaPct = reportedNoi !== 0 ? delta / Math.abs(reportedNoi) : delta > 0 ? 1 : 0;

    return {
      status: (deltaPct > RECONCILIATION_TOLERANCE_PCT ? 'discrepancy' : 'reconciled') as
        | 'discrepancy'
        | 'reconciled',
      computed,
      reportedNoi,
      deltaPct,
    };
  }

  private buildConfidenceMap(
    data: T12OperatingStatement,
    reconciliation: ReturnType<T12ExtractionService['reconcileTotals']>,
  ): Record<string, unknown> {
    return {
      documentAggregateConfidence: data.documentConfidence,
      reconciliation: {
        status: reconciliation.status,
        reportedNOI: reconciliation.reportedNoi,
        computedNOI: reconciliation.computed.netOperatingIncome,
        deltaPct: reconciliation.deltaPct,
      },
      discrepancyNotes: data.discrepancyNotes,
    };
  }

  private async recordFailedExtraction(
    document: { id: string; workspaceId: string },
    workspaceId: string,
    actorUserId: string,
    extractorVersion: string,
    failureDetail: Record<string, unknown>,
  ) {
    await this.db.client.documentExtraction.create({
      data: {
        documentId: document.id,
        extractorVersion,
        fieldsJson: {},
        confidenceJson: { documentAggregateConfidence: 0 },
        missingItemsJson: ['ALL_FIELDS'],
        sourceSpansJson: [],
        status: 'failed',
        failureDetailJson: failureDetail,
      } as any,
    });

    await this.db.client.auditLog.create({
      data: {
        workspaceId,
        actorUserId,
        entityType: 'document_extraction',
        entityId: document.id,
        action: 'extraction_failed',
        afterJson: failureDetail as any,
      },
    });
  }
}
