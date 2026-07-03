import { z } from 'zod';

const SourceSpanRef = z.object({
  spanId: z.string().uuid().nullable().describe(
    'References an entry in document_extractions.source_spans_json. Null if not locatable in source.'
  ),
});

const MonthlyMoneyField = z.object({
  monthlyValues: z.array(z.number().nullable())
    .length(12)
    .describe('Twelve monthly values in chronological order (oldest to newest), null for any month not reported.'),
  annualTotal: z.number().nullable().describe('Annual total as stated in the document, if a total column exists — do NOT compute this yourself, extract it as printed.'),
  currency: z.string().length(3).nullable(),
}).merge(SourceSpanRef);

const AnnualOnlyMoneyField = z.object({
  value: z.number().nullable(),
  currency: z.string().length(3).nullable(),
}).merge(SourceSpanRef);

// ---------------------------------------------------------------------------
// Income section
// ---------------------------------------------------------------------------

export const T12IncomeSchema = z.object({
  grossPotentialRent: MonthlyMoneyField.describe('GPR — total rent if all units were occupied at market/contract rate.'),
  physicalVacancyLoss: MonthlyMoneyField.describe('Revenue lost to vacant units, typically shown as a negative or contra figure.'),
  concessionsLoss: MonthlyMoneyField.describe('Revenue lost to rent concessions granted to tenants.'),
  badDebtLoss: MonthlyMoneyField.describe('Uncollectable rent / bad debt write-offs, if separately broken out.'),
  utilityChargebackIncome: MonthlyMoneyField.describe('RUBS or other utility reimbursement income collected from tenants.'),
  otherAncillaryIncome: z.array(z.object({
    category: z.string().describe('e.g. "Pet Rent", "Parking", "Laundry", "Storage", "Application Fees".'),
    monthlyValues: MonthlyMoneyField,
  })).describe('All other income line items broken out individually. Do not aggregate into a single "other" bucket if the source document itemizes them.'),
});

// ---------------------------------------------------------------------------
// Expense section
// ---------------------------------------------------------------------------

export const T12ExpenseSchema = z.object({
  propertyTaxes: MonthlyMoneyField,
  insurance: MonthlyMoneyField,
  repairsAndMaintenance: MonthlyMoneyField,
  utilities: MonthlyMoneyField.describe('Owner-paid utilities (common area electric, water/sewer not chargeable to tenants, etc.) — distinct from tenant utility chargeback income on the income side.'),
  managementFees: MonthlyMoneyField,
  advertisingAndMarketing: MonthlyMoneyField,
  administrativeCosts: MonthlyMoneyField.describe('General & administrative — office supplies, bank fees, legal, professional fees, etc.'),
  payrollAndBenefits: MonthlyMoneyField.describe('On-site staff payroll if separately reported (common for larger multifamily assets with on-site management/maintenance staff).'),
  otherExpenses: z.array(z.object({
    category: z.string().describe('e.g. "Pest Control", "Landscaping", "Trash Removal", "Pool Maintenance", "Capital Reserve Contribution".'),
    monthlyValues: MonthlyMoneyField,
  })).describe('All other expense line items broken out individually, matching the source document\'s own categorization.'),
});

// ---------------------------------------------------------------------------
// Document-level rollup + wrapper
// ---------------------------------------------------------------------------

export const T12OperatingStatementSchema = z.object({
  propertyName: z.object({ value: z.string().nullable() }).merge(SourceSpanRef),
  statementPeriodStart: z.object({ value: z.string().nullable().describe('ISO 8601 date of the first month covered.') }).merge(SourceSpanRef),
  statementPeriodEnd: z.object({ value: z.string().nullable().describe('ISO 8601 date of the last month covered.') }).merge(SourceSpanRef),

  income: T12IncomeSchema,
  expenses: T12ExpenseSchema,

  // Rolled-up annual figures. As with rent roll extraction, these should be
  // extracted AS STATED in the source document where the source shows
  // them explicitly (most T-12s print their own total/NOI row) — do not
  // have the model compute these from the line items, since a printed
  // total that disagrees with a line-item sum is itself a diligence
  // signal (transcription error or category mismatch in the source) that
  // should surface as a discrepancy, not get silently overwritten.
  reportedTotals: z.object({
    totalGrossRevenue: AnnualOnlyMoneyField.describe('As printed in the source document\'s own total row, if present.'),
    totalOperatingExpenses: AnnualOnlyMoneyField.describe('As printed in the source document\'s own total row, if present.'),
    netOperatingIncome: AnnualOnlyMoneyField.describe('As printed in the source document\'s own NOI row, if present.'),
  }).describe('Totals as explicitly stated in the source. May be null if the source does not print its own totals.'),

  documentConfidence: z.number().min(0).max(1)
    .describe('Overall confidence (0-1) in the completeness and accuracy of this extraction, scored conservatively.'),

  missingItems: z.array(z.string())
    .describe('Field/category names that could not be extracted, for document_extractions.missing_items_json.'),

  discrepancyNotes: z.array(z.string())
    .describe('Any case where the model noticed the source\'s own printed totals do not match the sum of line items it extracted, formatting inconsistencies across months, or other internal contradictions worth flagging to a reviewing analyst.'),
});

export type T12OperatingStatement = z.infer<typeof T12OperatingStatementSchema>;
export type T12Income = z.infer<typeof T12IncomeSchema>;
export type T12Expenses = z.infer<typeof T12ExpenseSchema>;

// ---------------------------------------------------------------------------
// Derived, computed-in-code (NOT model-extracted) helper — this is what the
// NestJS service uses to independently verify the model's reportedTotals
// against a bottom-up sum, which is exactly the kind of cross-check that
// makes the "trust deficit" pitch credible rather than just asserted.
// ---------------------------------------------------------------------------

export function sumMonthlyField(field: { monthlyValues: (number | null)[] }): number {
  return field.monthlyValues.reduce((sum: number, v) => sum + (v ?? 0), 0);
}

export function computeBottomUpTotals(data: T12OperatingStatement) {
  const grossRevenue =
    sumMonthlyField(data.income.grossPotentialRent) +
    sumMonthlyField(data.income.physicalVacancyLoss) +
    sumMonthlyField(data.income.concessionsLoss) +
    sumMonthlyField(data.income.badDebtLoss) +
    sumMonthlyField(data.income.utilityChargebackIncome) +
    data.income.otherAncillaryIncome.reduce((sum, item) => sum + sumMonthlyField(item.monthlyValues), 0);

  const operatingExpenses =
    sumMonthlyField(data.expenses.propertyTaxes) +
    sumMonthlyField(data.expenses.insurance) +
    sumMonthlyField(data.expenses.repairsAndMaintenance) +
    sumMonthlyField(data.expenses.utilities) +
    sumMonthlyField(data.expenses.managementFees) +
    sumMonthlyField(data.expenses.advertisingAndMarketing) +
    sumMonthlyField(data.expenses.administrativeCosts) +
    sumMonthlyField(data.expenses.payrollAndBenefits) +
    data.expenses.otherExpenses.reduce((sum, item) => sum + sumMonthlyField(item.monthlyValues), 0);

  return {
    grossRevenue,
    operatingExpenses,
    netOperatingIncome: grossRevenue - operatingExpenses,
  };
}
