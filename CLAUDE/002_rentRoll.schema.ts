// packages/ai-gateway/src/schemas/rentRoll.schema.ts
//
// Feed this directly to your AI Gateway's generateStructuredJson method as
// the target schema for multifamily rent roll (T-12/T-3 source) extraction.
//
// Design notes:
// - Every extracted numeric/date field is nullable, not optional-with-default.
//   Rent rolls are inconsistently formatted; force the model to say "I don't
//   know" (null) rather than hallucinate a plausible-looking $0 or a copied
//   date. This feeds your existing document_extractions.missing_items_json.
// - Every field carries a paired `_sourceSpan` reference id that maps back to
//   document_extractions.source_spans_json — this is what makes the citation
//   click-through actually work end to end, not just at the document level.
// - Confidence is captured per-unit, not just per-document, because rent
//   rolls commonly have some rows OCR'd cleanly and others (handwritten
//   annotations, faded photocopies) that are not.

import { z } from 'zod';

const SourceSpanRef = z.object({
  spanId: z.string().uuid().nullable().describe(
    'References an entry in document_extractions.source_spans_json. Null if this field could not be located in the source document.'
  ),
});

const MoneyField = z.object({
  value: z.number().nullable().describe('Amount in the document currency, as a decimal number, no symbols or commas.'),
  currency: z.string().length(3).nullable().describe('ISO 4217 currency code, e.g. USD.'),
}).merge(SourceSpanRef);

const DateField = z.object({
  value: z.string().nullable().describe('ISO 8601 date (YYYY-MM-DD). Null if not present or unparseable.'),
}).merge(SourceSpanRef);

const TextField = z.object({
  value: z.string().nullable(),
}).merge(SourceSpanRef);

const NumberField = z.object({
  value: z.number().nullable(),
}).merge(SourceSpanRef);

export const UtilityChargebackSchema = z.object({
  utilityType: z.enum(['water_sewer', 'electric', 'gas', 'trash', 'internet', 'pest_control', 'other'])
    .describe('Type of utility being charged back to the tenant.'),
  chargebackMethod: z.enum(['ratio_utility_billing_system', 'flat_fee', 'submetered', 'included_in_rent', 'unknown'])
    .describe('How the chargeback is calculated (RUBS, flat fee, submetered, or bundled into base rent).'),
  monthlyAmount: MoneyField.describe('Current monthly chargeback amount, if a flat or most-recent-billed figure is stated.'),
});

export const ConcessionSchema = z.object({
  concessionType: z.enum(['free_rent_months', 'reduced_rent', 'move_in_credit', 'other'])
    .describe('Category of concession granted to the tenant.'),
  description: z.string().nullable().describe('Free-text description as it appears in the source, e.g. "1 month free, month 2 of term".'),
  totalValue: MoneyField.describe('Total dollar value of the concession over the lease term, if calculable from the document.'),
});

export const RentRollUnitSchema = z.object({
  // --- Unit identification -------------------------------------------------
  unitNumber: TextField.describe('Unit identifier as printed on the rent roll, e.g. "204", "B-12".'),
  unitType: TextField.describe('Unit type / floorplan code, e.g. "1BR/1BA", "Studio", "2x2".'),
  bedrooms: NumberField.describe('Number of bedrooms. Studio = 0.'),
  bathrooms: NumberField.describe('Number of bathrooms, can be fractional (e.g. 1.5).'),
  squareFootage: NumberField.describe('Unit square footage if listed.'),

  // --- Occupancy & lease details --------------------------------------------
  occupancyStatus: z.enum(['occupied', 'vacant', 'notice_to_vacate', 'model_unit', 'down_unit', 'unknown'])
    .describe('Current occupancy status of the unit.'),
  tenantName: TextField.describe('Tenant name as listed. Null if vacant or redacted for privacy in the source.'),
  leaseStartDate: DateField,
  leaseEndDate: DateField,
  moveInDate: DateField,
  monthlyBaseRent: MoneyField.describe('Contracted monthly base rent, excluding chargebacks and fees.'),
  marketRent: MoneyField.describe('Listed market/asking rent for the unit, if the rent roll includes a market-rent column, for loss-to-lease calculation.'),
  securityDeposit: MoneyField,
  leaseStatus: z.enum(['current', 'month_to_month', 'notice_given', 'renewal_pending', 'expired', 'unknown'])
    .describe('Lease status as of the rent roll date.'),

  // --- Financial balances ----------------------------------------------------
  pastDueBalance: MoneyField.describe('Any past-due / delinquent balance owed by the tenant as of the rent roll date. Null (not zero) if the document does not report an aging balance for this unit.'),
  concessions: z.array(ConcessionSchema).describe('All concessions granted to this tenant, empty array if none stated.'),
  utilityChargebacks: z.array(UtilityChargebackSchema).describe('All utility chargeback line items applicable to this unit, empty array if none or if included in rent.'),
  otherFees: z.array(z.object({
    feeType: z.string().describe('e.g. "pet rent", "parking", "storage", "admin fee".'),
    monthlyAmount: MoneyField,
  })).describe('Any recurring fees beyond base rent and utility chargebacks.'),

  // --- Extraction quality ----------------------------------------------------
  rowConfidence: z.number().min(0).max(1)
    .describe('Model confidence (0-1) that this row was extracted correctly from the source document. Score conservatively — below 0.7 should trigger manual review in the UI.'),
  extractionNotes: z.string().nullable()
    .describe('Any ambiguity, illegibility, or conflicting data the model encountered for this specific unit row.'),
});

export const RentRollExtractionSchema = z.object({
  propertyName: TextField,
  rentRollAsOfDate: DateField.describe('The "as of" date printed on the rent roll, distinct from document upload date.'),
  totalUnitCount: NumberField.describe('Total number of units on the rent roll, as stated or countable from rows.'),

  units: z.array(RentRollUnitSchema).describe('One entry per unit row on the rent roll.'),

  // --- Document-level rollups (useful for a fast summary card before the
  // underwriting engine recomputes these independently from unit-level data)
  summary: z.object({
    occupiedUnitCount: NumberField,
    vacantUnitCount: NumberField,
    totalMonthlyGrossPotentialRent: MoneyField.describe('Sum of market rents across all units, if a market rent column exists.'),
    totalMonthlyActualRent: MoneyField.describe('Sum of actual base rent collected/contracted across occupied units.'),
    totalPastDueBalance: MoneyField,
  }),

  missingItems: z.array(z.string())
    .describe('Field names or unit numbers the model could not extract, to populate document_extractions.missing_items_json directly.'),
});

export type RentRollExtraction = z.infer<typeof RentRollExtractionSchema>;
export type RentRollUnit = z.infer<typeof RentRollUnitSchema>;

// ---------------------------------------------------------------------------
// Usage in apps/api (illustrative, adapt to your actual ai-gateway client):
//
// import { RentRollExtractionSchema } from '@atlas-rei/ai-gateway/schemas/rentRoll.schema';
//
// const result = await aiGateway.generateStructuredJson({
//   schema: RentRollExtractionSchema,
//   documentId: document.id,
//   promptVersion: 'rent-roll-extract-v1',
//   systemPrompt: RENT_ROLL_SYSTEM_PROMPT, // instruct: null over guessing,
//                                           // always populate spanId when locatable
// });
//
// await prisma.documentExtraction.create({
//   data: {
//     documentId: document.id,
//     extractorVersion: 'rent-roll-extract-v1',
//     fieldsJson: result.data,
//     confidenceJson: buildConfidenceMap(result.data),
//     missingItemsJson: result.data.missingItems,
//     sourceSpansJson: result.sourceSpans,
//   },
// });
// ---------------------------------------------------------------------------
