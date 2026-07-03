import { z } from 'zod';

const InputSourceRef = z.enum([
  'property_details',
  'rent_roll_extraction',
  't12_extraction',
  'investor_mandate',
]);

const SupportedClaim = z.object({
  text: z.string().describe('A single factual claim or observation, in plain prose.'),
  basedOn: z.array(InputSourceRef).describe('Which input source(s) this claim is derived from.'),
});

export const MandateComplianceCheckSchema = z.object({
  mandateLabel: z.string().describe('Human-readable name of the mandate being checked, e.g. "Max LTV", "Min Gross Yield".'),
  mandateThreshold: z.union([z.number(), z.string()]),
  dealValue: z.union([z.number(), z.string(), z.null()]),
  status: z.enum(['pass', 'fail', 'insufficient_data'])
    .describe('insufficient_data if the deal value needed to evaluate this mandate was not available from the extraction inputs.'),
  explanation: z.string().describe('One sentence explaining the comparison, e.g. "Gross yield of 8.76% exceeds the 8.00% minimum threshold."'),
});

export const CommitteeMemoSchema = z.object({
  executiveSummary: z.string()
    .describe('2-4 sentence high-level summary of the deal and the recommendation.'),

  dealThesis: z.array(SupportedClaim)
    .describe('The core reasons this acquisition makes sense — market position, value-add opportunity, in-place cash flow quality, etc. 3-6 bullet-equivalent claims.'),

  risksAndObjections: z.array(SupportedClaim)
    .describe('Specific, concrete risks a skeptical committee member would raise — not generic real estate risk boilerplate. Must reference actual figures from the inputs (e.g. a specific vacancy rate, a specific expense line trending up) rather than "market risk exists."'),

  changeConditions: z.array(z.object({
    condition: z.string().describe('A specific condition that would change the recommendation, e.g. "If Q3 vacancy exceeds 8%, reassess pricing."'),
    rationale: z.string(),
  })).describe('Conditions under which this recommendation should be revisited — gives the committee explicit criteria for follow-up rather than a one-time yes/no.'),

  t12DiscrepancyHighlights: z.array(z.object({
    description: z.string().describe('Plain-language description of the discrepancy, e.g. "Seller-reported NOI is $42,000 higher than the sum of extracted line items."'),
    severity: z.enum(['informational', 'moderate', 'material'])
      .describe('material = large enough to affect the go/no-go decision or pricing; moderate = worth flagging but not deal-breaking; informational = minor rounding/timing difference.'),
  })).describe('Empty array if no reconciliation discrepancy was found in the T-12 extraction.'),

  mandateComplianceChecks: z.array(MandateComplianceCheckSchema)
    .describe('One entry per active investor mandate, regardless of pass/fail — the committee needs to see the full mandate checklist, not just violations.'),

  overallRecommendation: z.enum(['proceed', 'proceed_with_conditions', 'do_not_proceed', 'insufficient_data'])
    .describe('insufficient_data if rent roll or T-12 extraction is missing/failed — the memo should say so rather than draft a recommendation on incomplete inputs.'),

  dataGaps: z.array(z.string())
    .describe('Any of the 4 required inputs that were missing, incomplete, or low-confidence, which the committee should be aware of before relying on this memo.'),
});

export type CommitteeMemo = z.infer<typeof CommitteeMemoSchema>;
export type MandateComplianceCheck = z.infer<typeof MandateComplianceCheckSchema>;
