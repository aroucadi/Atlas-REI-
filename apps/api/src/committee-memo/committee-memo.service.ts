import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';
import {
  CommitteeMemoSchema,
  CommitteeMemo,
  RentRollExtraction,
  T12OperatingStatement,
  computeBottomUpTotals,
} from '@atlas/ai-gateway';

const DEFAULT_MEMO_VERSION = 'committee-memo-v1';

const COMMITTEE_MEMO_SYSTEM_PROMPT = `
You are drafting an investment committee memo for a real estate acquisitions
team. You will be given: property details, a rent roll summary, a T-12
operating statement summary (including any reconciliation discrepancy
between the seller's reported NOI and the sum of extracted line items), and
the fund's active investment mandates.

Rules:
- Every claim in dealThesis and risksAndObjections must be traceable to the
  actual input data provided — cite specific numbers, not generalities.
  Do not write generic real estate risk language ("market conditions could
  change") without tying it to something specific in this deal's data.
- For mandateComplianceChecks, evaluate EVERY mandate provided, even ones
  that clearly pass — the committee needs the full checklist.
- If reconciliation discrepancy data indicates a material NOI difference
  between reported and computed figures, this MUST appear in both
  t12DiscrepancyHighlights and, if severity is material, in
  risksAndObjections.
- If rent roll or T-12 data is missing or extraction failed, set
  overallRecommendation to "insufficient_data" and list the gap in
  dataGaps — do not draft a full recommendation on incomplete inputs.
- Be direct and specific. Committee members are experienced real estate
  professionals, not general audiences — write accordingly, no filler.
`.trim();

export interface GenerateMemoOptions {
  workspaceId: string;
  propertyId: string;
  requestedByUserId: string;
  forceRegenerate?: boolean;
}

@Injectable()
export class CommitteeMemoService {
  private readonly logger = new Logger(CommitteeMemoService.name);
  private readonly aiGateway: AiGateway;

  constructor(
    private readonly db: DatabaseService,
  ) {
    this.aiGateway = new AiGateway();
  }

  async getOrGenerate(options: GenerateMemoOptions) {
    const { workspaceId, propertyId, requestedByUserId, forceRegenerate = false } = options;

    if (!forceRegenerate) {
      const existing = await this.db.client.committeeMemo.findFirst({
        where: { workspaceId, propertyId, memoVersion: DEFAULT_MEMO_VERSION },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return existing;
    }

    return this.generate({ workspaceId, propertyId, requestedByUserId });
  }

  async generate(options: Omit<GenerateMemoOptions, 'forceRegenerate'>) {
    const { workspaceId, propertyId, requestedByUserId } = options;

    // 1. Gather all inputs.
    const property = await this.db.client.property.findUnique({
      where: { id: propertyId },
      include: { country: true },
    });
    if (!property) {
      throw new NotFoundException(`Property ${propertyId} not found`);
    }

    const rentRollExtraction = await this.db.client.documentExtraction.findFirst({
      where: {
        status: 'completed',
        document: {
          workspaceId,
          entityType: 'property',
          entityId: propertyId,
          documentType: 'rent_roll',
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const t12Extraction = await this.db.client.documentExtraction.findFirst({
      where: {
        status: 'completed',
        document: {
          workspaceId,
          entityType: 'property',
          entityId: propertyId,
          documentType: 'operating_statement',
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const profile = await this.db.client.investorProfile.findFirst({
      where: { workspaceId },
    });

    const underwriteRun = await this.db.client.underwriteRun.findFirst({
      where: { propertyId, workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    if (!rentRollExtraction && !t12Extraction) {
      throw new BadRequestException(
        `Cannot generate a committee memo for property ${propertyId}: neither a rent roll ` +
          `nor a T-12 extraction is available. Run extraction on at least one document first.`,
      );
    }

    // 2. Build mandates dynamically from the InvestorProfile
    const activeMandates = this.buildMandatesFromProfile(profile);

    // 3. Build input summary
    const inputSummary = this.buildInputSummary(
      property,
      rentRollExtraction,
      t12Extraction,
      activeMandates,
    );

    const memo = await this.aiGateway.generateStructuredJson<CommitteeMemo>(
      JSON.stringify(inputSummary, null, 2),
      CommitteeMemoSchema,
      COMMITTEE_MEMO_SYSTEM_PROMPT,
    );

    // 4. Sanity check compliance
    const complianceMismatches = this.sanityCheckMandateCompliance(
      memo,
      activeMandates,
      inputSummary,
      underwriteRun,
    );

    // 5. Persist
    const savedMemo = await this.db.client.committeeMemo.create({
      data: {
        workspaceId,
        propertyId,
        memoVersion: DEFAULT_MEMO_VERSION,
        contentJson: memo as any,
        complianceMismatchesJson: complianceMismatches as any,
        generatedByUserId: requestedByUserId,
        inputSourcesJson: {
          rentRollExtractionId: rentRollExtraction?.id ?? null,
          t12ExtractionId: t12Extraction?.id ?? null,
          investorProfileId: profile?.id ?? null,
          underwriteRunId: underwriteRun?.id ?? null,
        } as any,
      },
    });

    const workspace = await this.db.client.workspace.findUnique({ where: { id: workspaceId } });

    await this.db.client.auditLog.create({
      data: {
        organizationId: workspace?.organizationId,
        workspaceId,
        actorUserId: requestedByUserId,
        entityType: 'committee_memo',
        entityId: savedMemo.id,
        action: 'created',
        afterJson: {
          overallRecommendation: memo.overallRecommendation,
          dataGaps: memo.dataGaps,
          complianceMismatchCount: complianceMismatches.length,
        } as any,
      },
    });

    return savedMemo;
  }

  private buildMandatesFromProfile(profile: any): any[] {
    const mandates: any[] = [];
    if (!profile) return mandates;

    if (profile.capitalAvailable) {
      mandates.push({
        label: 'Capital Sufficiency',
        thresholdValue: Number(profile.capitalAvailable),
        valueType: 'currency',
        comparisonOperator: 'min',
      });
    }

    const targetCountries = (profile.targetCountriesJson as string[]) || [];
    if (targetCountries.length > 0) {
      mandates.push({
        label: 'Country Fit',
        thresholdValue: targetCountries.join(','),
        valueType: 'string',
        comparisonOperator: 'in',
      });
    }

    const constraints = (profile.constraintsJson as Record<string, any>) || {};
    if (constraints.minGrossYield) {
      mandates.push({
        label: 'Min Gross Yield',
        thresholdValue: Number(constraints.minGrossYield),
        valueType: 'percent',
        comparisonOperator: 'min',
      });
    }
    if (constraints.maxLtv) {
      mandates.push({
        label: 'Max LTV',
        thresholdValue: Number(constraints.maxLtv),
        valueType: 'percent',
        comparisonOperator: 'max',
      });
    }

    return mandates;
  }

  private buildInputSummary(
    property: any,
    rentRollExtraction: any | null,
    t12Extraction: any | null,
    mandates: any[],
  ) {
    const rentRollSummary = rentRollExtraction
      ? this.summarizeRentRoll(rentRollExtraction.fieldsJson as RentRollExtraction)
      : { status: 'not_available' as const };

    const t12Summary = t12Extraction
      ? this.summarizeT12(t12Extraction.fieldsJson as T12OperatingStatement, t12Extraction.confidenceJson)
      : { status: 'not_available' as const };

    return {
      property: {
        name: property.name,
        city: property.city || '',
        state: property.state || '',
        location: `${property.city || ''}, ${property.state || ''}`,
        purchasePrice: Number(property.purchasePrice || 0),
        unitCount: Number(property.unitCount || 1),
        yearBuilt: property.yearBuilt ? Number(property.yearBuilt) : null,
        countryCode: property.country?.countryCode || '',
      },
      rentRollSummary,
      t12Summary,
      mandates: mandates.map((m) => ({
        label: m.label,
        thresholdValue: m.thresholdValue,
        valueType: m.valueType,
        comparisonOperator: m.comparisonOperator,
      })),
    };
  }

  private summarizeRentRoll(data: RentRollExtraction) {
    const occupied = data.units.filter((u: any) => u.occupancyStatus === 'occupied');
    const vacant = data.units.filter((u: any) => u.occupancyStatus === 'vacant');
    const avgRent =
      occupied.length > 0
        ? occupied.reduce((sum: number, u: any) => sum + (u.monthlyBaseRent.value ?? 0), 0) / occupied.length
        : null;
    const totalPastDue = data.units.reduce((sum: number, u: any) => sum + (u.pastDueBalance.value ?? 0), 0);

    return {
      status: 'available' as const,
      totalUnits: data.units.length,
      occupiedUnits: occupied.length,
      vacantUnits: vacant.length,
      occupancyRate: data.units.length > 0 ? occupied.length / data.units.length : null,
      averageMonthlyRent: avgRent,
      totalPastDueBalance: totalPastDue,
    };
  }

  private summarizeT12(data: T12OperatingStatement, confidenceJson: any) {
    const computed = computeBottomUpTotals(data);
    return {
      status: 'available' as const,
      grossPotentialRentAnnual: sumMonthlySafe(data.income.grossPotentialRent.monthlyValues),
      computedTotalGrossRevenue: computed.grossRevenue,
      computedTotalOperatingExpenses: computed.operatingExpenses,
      computedNOI: computed.netOperatingIncome,
      reportedNOI: data.reportedTotals.netOperatingIncome.value,
      reconciliation: confidenceJson?.reconciliation ?? null,
      discrepancyNotes: data.discrepancyNotes,
    };
  }

  private sanityCheckMandateCompliance(
    memo: CommitteeMemo,
    mandates: any[],
    inputSummary: ReturnType<CommitteeMemoService['buildInputSummary']>,
    underwriteRun: any | null,
  ): Array<{ mandateLabel: string; modelStatus: string; recomputedStatus: string }> {
    const mismatches: Array<{ mandateLabel: string; modelStatus: string; recomputedStatus: string }> = [];

    for (const check of memo.mandateComplianceChecks) {
      const mandate = mandates.find((m) => m.label === check.mandateLabel);
      if (!mandate) continue;

      const recomputed = this.recomputeSingleMandate(mandate, inputSummary, underwriteRun);
      if (recomputed !== null && recomputed !== check.status) {
        mismatches.push({
          mandateLabel: check.mandateLabel,
          modelStatus: check.status,
          recomputedStatus: recomputed,
        });
      }
    }

    return mismatches;
  }

  private recomputeSingleMandate(
    mandate: any,
    inputSummary: ReturnType<CommitteeMemoService['buildInputSummary']>,
    underwriteRun: any | null,
  ): 'pass' | 'fail' | null {
    if (mandate.label === 'Min Gross Yield') {
      const grossPotentialRentAnnual =
        inputSummary.t12Summary.status === 'available'
          ? inputSummary.t12Summary.grossPotentialRentAnnual
          : 0;
      const purchasePrice = inputSummary.property.purchasePrice;

      if (grossPotentialRentAnnual > 0 && purchasePrice > 0) {
        const grossYield = grossPotentialRentAnnual / purchasePrice;
        return grossYield >= mandate.thresholdValue ? 'pass' : 'fail';
      }
      return null;
    }

    if (mandate.label === 'Max LTV' && underwriteRun) {
      const assumptions = (underwriteRun.assumptionsJson as any) || {};
      const ltv = assumptions.ltv ?? (assumptions.financing ? (1 - (assumptions.financing.downPaymentPct || 1.0)) : null);
      if (ltv !== null && typeof ltv === 'number') {
        return ltv <= mandate.thresholdValue ? 'pass' : 'fail';
      }
      return null;
    }

    if (mandate.label === 'Capital Sufficiency' && underwriteRun) {
      const metricsObj = (underwriteRun.metricsJson as any) || {};
      const totalCapitalRequired = metricsObj.totalCapitalRequired || null;
      if (totalCapitalRequired !== null && typeof totalCapitalRequired === 'number') {
        return mandate.thresholdValue >= totalCapitalRequired ? 'pass' : 'fail';
      }
      return null;
    }

    if (mandate.label === 'Country Fit') {
      const countryCode = inputSummary.property.countryCode;
      if (countryCode) {
        const countries = String(mandate.thresholdValue).split(',');
        return countries.includes(countryCode) ? 'pass' : 'fail';
      }
      return null;
    }

    return null;
  }

  async signOff(workspaceId: string, propertyId: string, userId: string) {
    const memo = await this.db.client.committeeMemo.findFirst({
      where: { workspaceId, propertyId, memoVersion: DEFAULT_MEMO_VERSION },
      orderBy: { createdAt: 'desc' },
    });
    if (!memo) {
      throw new NotFoundException(`No committee memo found to sign off`);
    }

    const updated = await this.db.client.committeeMemo.update({
      where: { id: memo.id },
      data: {
        status: 'signed_off',
        signedOffByUserId: userId,
        signedOffAt: new Date(),
      },
    });

    const workspace = await this.db.client.workspace.findUnique({ where: { id: workspaceId } });

    await this.db.client.auditLog.create({
      data: {
        organizationId: workspace?.organizationId,
        workspaceId,
        actorUserId: userId,
        entityType: 'committee_memo',
        entityId: updated.id,
        action: 'signed_off',
        afterJson: {
          overallRecommendation: (updated.contentJson as any).overallRecommendation,
          status: 'signed_off',
        } as any,
      },
    });

    return updated;
  }
}

function sumMonthlySafe(values: (number | null)[]): number {
  const clean = values.filter((v): v is number => v !== null);
  return clean.reduce((sum: number, v: number) => sum + v, 0);
}
