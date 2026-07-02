import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';
import { UnderwriteService } from '../underwrite/underwrite.service';
import { CommitteeEvaluationResultSchema } from '@atlas/shared-types';
import { ForexService } from '../event/forex.service';
import { config } from '../config';

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
  USD: { AED: 3.6725, EUR: 0.92, USD: 1 },
  AED: { USD: 1 / 3.6725, EUR: 0.92 / 3.6725, AED: 1 },
  EUR: { USD: 1 / 0.92, AED: 3.6725 / 0.92, EUR: 1 },
};

function convertCurrency(amount: number, from: string, to: string): number {
  const fromKey = from.toUpperCase();
  const toKey = to.toUpperCase();
  if (fromKey === toKey) return amount;
  const rates = EXCHANGE_RATES[fromKey];
  const rate = rates ? rates[toKey] : undefined;
  if (!rate) {
    throw new BadRequestException(
      `Unsupported currency conversion from ${from} to ${to}`,
    );
  }
  return amount * rate;
}

@Injectable()
export class CommitteeService {
  private readonly aiGateway: AiGateway;

  constructor(
    private readonly db: DatabaseService,
    private readonly underwriteService: UnderwriteService,
    private readonly forexService?: ForexService,
  ) {
    this.aiGateway = new AiGateway();
  }

  async evaluateDeal(
    userId: string,
    workspaceId: string,
    investorProfileId: string,
    underwriteRunId: string,
  ) {
    // 1. Fetch the investor profile from DB
    const profile = await this.db.client.investorProfile.findFirst({
      where: {
        id: investorProfileId,
        workspaceId,
      },
    });

    if (!profile) {
      throw new BadRequestException(
        'Investor profile not found in this workspace',
      );
    }

    // 2. Fetch the underwrite run record
    const underwriteRun = await this.db.client.underwriteRun.findFirst({
      where: {
        id: underwriteRunId,
        workspaceId,
      },
      include: {
        property: {
          include: {
            city: {
              include: {
                country: true,
              },
            },
            building: true,
          },
        },
      },
    });

    if (!underwriteRun) {
      throw new BadRequestException(
        'Underwrite run not found in this workspace',
      );
    }

    const property = underwriteRun.property;
    const underwritingResult = underwriteRun.metricsJson as any;

    // Fetch relevant evidence ledger for the property/workspace
    const evidenceList = await this.db.client.evidence.findMany({
      where: {
        workspaceId,
        OR: [{ propertyId: property.id }, { propertyId: null }],
      },
      orderBy: {
        freshness: 'desc',
      },
    });

    let evidenceContext = '';
    if (evidenceList.length === 0) {
      evidenceContext =
        'No evidence records are currently registered for this property or workspace.\n';
    } else {
      evidenceList.forEach((ev) => {
        evidenceContext += `- Evidence ID: ${ev.id}\n  Title: ${ev.title}\n  Source: ${ev.sourceType} (ID: ${ev.sourceId})\n  Freshness: ${ev.freshness.toISOString()}\n  Confidence: ${ev.confidence || 'N/A'}\n`;
        if (ev.snippet) {
          evidenceContext += `  Snippet: ${ev.snippet}\n`;
        }
        evidenceContext += '\n';
      });
    }

    // 3. Draft prompt containing deterministic math outputs, investor constraints, and evidence
    const prompt = `
Please evaluate this real estate investment deal.

### Investor Profile Mandate:
- Capital Available: ${profile.capitalAvailable} ${profile.baseCurrency}
- Risk Tolerance: ${profile.riskTolerance}
- Horizon: ${profile.investmentHorizonMonths} months
- Preference: ${profile.incomeVsGrowthPreference}
- Financing Preference: ${profile.financingPreference}
- Target Countries: ${JSON.stringify(profile.targetCountriesJson)}
- Constraints: ${JSON.stringify(profile.constraintsJson)}
- Goals: ${JSON.stringify(profile.goalsJson)}

### Underwriting Metrics (Guaranteed Correct/Deterministic Math):
- Currency: ${underwritingResult.currency}
- Purchase Price: ${underwritingResult.purchasePrice}
- Gross Yield: ${(underwritingResult.metrics.grossYield * 100).toFixed(2)}%
- Net Yield: ${(underwritingResult.metrics.netYield * 100).toFixed(2)}%
- Cap Rate: ${(underwritingResult.metrics.capRate * 100).toFixed(2)}%
- Cash on Cash Yield: ${(underwritingResult.metrics.cashOnCashYield * 100).toFixed(2)}%
- DSCR: ${underwritingResult.metrics.dscr}
- Equity Invested: ${underwritingResult.metrics.equityInvested}
- Monthly Mortgage: ${underwritingResult.metrics.monthlyMortgagePayment}

### Available Workspace & Property Evidence Ledger:
${evidenceContext}

Provide a structured evaluation in JSON format matching the following schema:
{
  "verdict": "Strong Buy" | "Buy" | "Wait" | "Avoid",
  "confidenceScore": number (between 0.0 and 1.0),
  "thesisSummary": "string explanation of why the deal fits the mandate",
  "objectionsSummary": "string list of potential risks or mismatches",
  "changeConditionsSummary": "string conditions under which this deal would become an absolute approve",
  "thesisClaims": [
    {
      "statement": "string",
      "isSupported": boolean,
      "evidenceId": "string (uuid, must match one of the Evidence IDs from the list above, or null if unsupported)",
      "confidence": number | null,
      "freshness": "string (date-time, or null)",
      "source": "string (or null)"
    }
  ],
  "objectionsClaims": [
    {
      "statement": "string",
      "isSupported": boolean,
      "evidenceId": "string (uuid, or null)",
      "confidence": number | null,
      "freshness": "string (date-time, or null)",
      "source": "string (or null)"
    }
  ],
  "changeConditionsClaims": [
    {
      "statement": "string",
      "isSupported": boolean,
      "evidenceId": "string (uuid, or null)",
      "confidence": number | null,
      "freshness": "string (date-time, or null)",
      "source": "string (or null)"
    }
  ]
}

Guidance for Claims:
1. For every key point in your thesis, objections, or change conditions, generate a corresponding claim.
2. If a claim matches any facts in the provided evidence ledger, set "isSupported" to true, and copy the "Evidence ID" into "evidenceId". Populate "confidence", "freshness" and "source" based on the matched evidence record.
3. If a claim is an inference or assumption NOT explicitly found in the evidence ledger, set "isSupported" to false, and set "evidenceId", "confidence", "freshness", and "source" to null.
`;

    const reasons: string[] = [];

    // 1. Capital sufficiency
    const dealCurrency = underwritingResult.currency;
    const profileCurrency = profile.baseCurrency;
    const totalCapitalRequired = underwritingResult.totalCapitalRequired;
    const totalCapitalRequiredInProfileCurrency = this.forexService
      ? await this.forexService.convert(
          totalCapitalRequired,
          dealCurrency,
          profileCurrency,
        )
      : convertCurrency(totalCapitalRequired, dealCurrency, profileCurrency);
    const capitalAvailable = Number(profile.capitalAvailable);
    if (capitalAvailable < totalCapitalRequiredInProfileCurrency) {
      reasons.push(
        `Capital insufficiency: required ${totalCapitalRequiredInProfileCurrency.toFixed(2)} ${profileCurrency} but only ${capitalAvailable.toFixed(2)} ${profileCurrency} available`,
      );
    }

    // 2. Country fit
    const targetCountries = (profile.targetCountriesJson as string[]) || [];
    if (!targetCountries.includes(underwritingResult.countryCode)) {
      reasons.push(
        `Country mismatch: deal is in ${underwritingResult.countryCode} but target countries are [${targetCountries.join(', ')}]`,
      );
    }

    // 3. Financing preference
    const hasFinancing =
      underwriteRun.assumptionsJson &&
      !!(underwriteRun.assumptionsJson as any).financing;
    if (profile.financingPreference === 'cash' && hasFinancing) {
      reasons.push(
        `Financing preference mismatch: profile prefers cash but underwrite uses financing`,
      );
    }
    if (profile.financingPreference === 'mortgage' && !hasFinancing) {
      reasons.push(
        `Financing preference mismatch: profile prefers mortgage but underwrite uses cash`,
      );
    }

    // 4. Risk tolerance fit
    const assumptions = underwriteRun.assumptionsJson as any;
    const isOffPlan = !!assumptions?.isOffPlan;
    const downPaymentPct = hasFinancing
      ? assumptions.financing.downPaymentPct
      : 1.0;
    const ltv = 1.0 - downPaymentPct;

    if (profile.riskTolerance === 'conservative') {
      if (isOffPlan) {
        reasons.push(
          `Risk tolerance mismatch: conservative profile cannot invest in off-plan properties`,
        );
      }
      if (ltv > 0.6) {
        reasons.push(
          `Risk tolerance mismatch: conservative profile cannot use leverage above 60% LTV (current LTV: ${(ltv * 100).toFixed(1)}%)`,
        );
      }
    } else if (profile.riskTolerance === 'moderate') {
      if (ltv > 0.8) {
        reasons.push(
          `Risk tolerance mismatch: moderate profile cannot use leverage above 80% LTV (current LTV: ${(ltv * 100).toFixed(1)}%)`,
        );
      }
    }

    // 5. Underwriting hard vetoes
    const netYield = underwritingResult.metrics?.netYield ?? 0;
    if (netYield < 0) {
      reasons.push(
        `Underwriting veto: deal has negative net yield (${(netYield * 100).toFixed(2)}%)`,
      );
    }
    const dscr = underwritingResult.metrics?.dscr;
    if (hasFinancing && dscr !== null && dscr !== undefined && dscr < 1.0) {
      reasons.push(
        `Underwriting veto: debt service coverage ratio (DSCR) is below 1.0 (${dscr.toFixed(2)})`,
      );
    }

    const policyVerdict = reasons.length > 0 ? 'Avoid' : 'Buy';

    const isSim = this.aiGateway.isSimulationMode();
    const isProd = config.isProduction;
    if (isSim && isProd) {
      throw new BadRequestException(
        'AI mock execution is forbidden in production environments.',
      );
    }

    // Create AI Run record to track provenance BEFORE calling the model
    const aiRun = await this.db.client.aiRun.create({
      data: {
        workspaceId,
        jobType: 'committee_evaluation',
        modelProvider: isSim ? 'mock' : 'google',
        modelName: isSim ? 'mock' : 'gemini-1.5-flash',
        promptVersion: 'v1.0.0',
        status: 'queued',
        inputRefJson: {
          investorProfileId,
          underwriteRunId,
          propertyId: property.id,
          underwritingMetrics: underwritingResult.metrics,
        } as any,
      },
    });

    try {
      // Call model-agnostic AI Gateway with Zod validation schema exactly once
      const response = await this.aiGateway.generateStructuredJson<{
        verdict: 'Strong Buy' | 'Buy' | 'Wait' | 'Avoid';
        confidenceScore: number;
        thesisSummary: string;
        objectionsSummary: string;
        changeConditionsSummary: string;
        thesisClaims: any[];
        objectionsClaims: any[];
        changeConditionsClaims: any[];
        _aiSource?: 'model' | 'simulation_fallback';
      }>(
        prompt,
        CommitteeEvaluationResultSchema,
        'You are the AI Investment Committee agent at Atlas REI. Your role is to interpret deterministic underwriting results and cross-reference them with investor mandates. Trust the financial calculations provided; do not perform your own math.',
      );

      // Determine actual provenance from the gateway response
      const wasRealModel = response._aiSource === 'model';
      const actualProvider = wasRealModel ? 'google' : 'mock';
      const actualSource = wasRealModel ? 'system' : 'mock';

      // Update AI Run to completed with correct provenance
      await this.db.client.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: 'completed',
          modelProvider: actualProvider,
          modelName: wasRealModel ? 'gemini-1.5-flash' : 'mock',
          outputRefJson: response as any,
        },
      });

      // Strip internal _aiSource before persisting the decision
      const evaluationResult = { ...response };
      delete (evaluationResult as any)._aiSource;

      // Save formal audit trail record in DB
      const isOverruled =
        policyVerdict === 'Avoid' && evaluationResult.verdict !== 'Avoid';
      const finalVerdict = isOverruled ? 'Avoid' : evaluationResult.verdict;
      const overrideReason = isOverruled ? reasons.join('; ') : null;

      const decision = await this.db.client.investmentDecision.create({
        data: {
          workspaceId,
          investorProfileId,
          entityType: 'property',
          entityId: property.id,
          verdict: finalVerdict,
          policyVerdict,
          aiVerdict: evaluationResult.verdict,
          overrideReason,
          confidenceScore: evaluationResult.confidenceScore,
          thesisSummary: evaluationResult.thesisSummary,
          objectionsSummary: evaluationResult.objectionsSummary,
          changeConditionsSummary: evaluationResult.changeConditionsSummary,
          thesisClaimsJson: evaluationResult.thesisClaims as any,
          objectionsClaimsJson: evaluationResult.objectionsClaims as any,
          changeConditionsClaimsJson:
            evaluationResult.changeConditionsClaims as any,
          decisionSource: actualSource,
          aiRunId: aiRun.id,
          underwriteRunId: underwriteRun.id,
        },
      });

      return mapDecision(decision);
    } catch (error: any) {
      // Update AI Run to failed
      await this.db.client.aiRun.update({
        where: { id: aiRun.id },
        data: {
          status: 'failed',
          errorMessage: error.message || 'Structured JSON generation failed',
        },
      });
      throw error;
    }
  }

  async getDecision(workspaceId: string, runId: string) {
    const decision = await this.db.client.investmentDecision.findFirst({
      where: {
        workspaceId,
        OR: [{ id: runId }, { underwriteRunId: runId }],
      },
    });

    if (!decision) {
      throw new NotFoundException(
        'Committee run decision not found in this workspace',
      );
    }

    return mapDecision(decision);
  }
}

function mapDecision(decision: any) {
  if (!decision) return null;
  return {
    ...decision,
    confidenceScore:
      decision.confidenceScore !== null
        ? Number(decision.confidenceScore)
        : null,
    thesisClaims: decision.thesisClaimsJson || [],
    objectionsClaims: decision.objectionsClaimsJson || [],
    changeConditionsClaims: decision.changeConditionsClaimsJson || [],
  };
}
