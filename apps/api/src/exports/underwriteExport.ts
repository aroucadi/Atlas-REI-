// apps/api/src/exports/underwriteExport.ts
//
// Design principle: the JSON payload is shaped as a FLAT list of labeled
// (section, field, value, unit) rows rather than a nested object tree.
// CRE analysts think in terms of an Excel row, not a JSON path — this shape
// lets the exceljs writer iterate once, with zero per-field special-casing,
// and it's trivial to extend when you add fields later (just add a row).

import ExcelJS from 'exceljs';

// ---------------------------------------------------------------------------
// 1. The JSON contract the API returns from GET /underwrites/:id/export
// ---------------------------------------------------------------------------

export type UnderwriteFieldFormat = 'currency' | 'percent' | 'number' | 'date' | 'text' | 'ratio';

export interface UnderwriteExportRow {
  section: string;         // Excel row grouping -> becomes a section header
  label: string;            // Human-readable row label, column A
  value: number | string | null;
  format: UnderwriteFieldFormat;
  currency?: string;        // ISO 4217, required when format === 'currency'
  sourceSpanId?: string | null; // links back to document_extractions for citation click-through
  notes?: string;
}

export interface UnderwriteExportPayload {
  meta: {
    propertyName: string;
    workspaceId: string;
    underwriteRunId: string;
    generatedAt: string; // ISO 8601
    analystName: string;
  };
  rows: UnderwriteExportRow[];
}

// ---------------------------------------------------------------------------
// 2. Example payload — this is the exact shape apps/api should serialize.
//    Build this from your underwriting result + mandate constraint tables,
//    not by hand — shown fully here so the field set and format tags are
//    unambiguous for whoever wires up the serializer.
// ---------------------------------------------------------------------------

export const exampleUnderwritePayload: UnderwriteExportPayload = {
  meta: {
    propertyName: 'Cedar Point Apartments',
    workspaceId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    underwriteRunId: 'a1b2c3d4-1111-2222-3333-444455556666',
    generatedAt: '2026-07-02T00:00:00Z',
    analystName: 'J. Rivera',
  },
  rows: [
    // --- Acquisition -------------------------------------------------------
    { section: 'Acquisition', label: 'Purchase Price', value: 18500000, format: 'currency', currency: 'USD', sourceSpanId: null },
    { section: 'Acquisition', label: 'Price per Unit', value: 154167, format: 'currency', currency: 'USD' },
    { section: 'Acquisition', label: 'Closing Costs', value: 185000, format: 'currency', currency: 'USD' },
    { section: 'Acquisition', label: 'Total Capitalization', value: 18685000, format: 'currency', currency: 'USD' },

    // --- Financing -----------------------------------------------------------
    { section: 'Financing', label: 'Loan Amount', value: 13875000, format: 'currency', currency: 'USD' },
    { section: 'Financing', label: 'LTV', value: 0.75, format: 'percent' },
    { section: 'Financing', label: 'Interest Rate', value: 0.0625, format: 'percent' },
    { section: 'Financing', label: 'Amortization (months)', value: 360, format: 'number' },
    { section: 'Financing', label: 'Term (months)', value: 60, format: 'number' },
    { section: 'Financing', label: 'DSCR', value: 1.32, format: 'ratio' },

    // --- Income --------------------------------------------------------------
    { section: 'Income', label: 'Gross Potential Rent (Annual)', value: 1620000, format: 'currency', currency: 'USD', sourceSpanId: 'span-9911' },
    { section: 'Income', label: 'Vacancy Loss', value: -81000, format: 'currency', currency: 'USD' },
    { section: 'Income', label: 'Loss to Lease', value: -32400, format: 'currency', currency: 'USD' },
    { section: 'Income', label: 'Utility Chargeback Income', value: 64800, format: 'currency', currency: 'USD', sourceSpanId: 'span-9922' },
    { section: 'Income', label: 'Other Income (parking, storage, pet)', value: 41000, format: 'currency', currency: 'USD' },
    { section: 'Income', label: 'Effective Gross Income', value: 1612400, format: 'currency', currency: 'USD' },

    // --- Expenses ------------------------------------------------------------
    { section: 'Expenses', label: 'Property Taxes', value: 148000, format: 'currency', currency: 'USD' },
    { section: 'Expenses', label: 'Insurance', value: 62000, format: 'currency', currency: 'USD' },
    { section: 'Expenses', label: 'Service Charges / CAM', value: 94000, format: 'currency', currency: 'USD', sourceSpanId: 'span-9933' },
    { section: 'Expenses', label: 'Repairs & Maintenance', value: 88000, format: 'currency', currency: 'USD' },
    { section: 'Expenses', label: 'Management Fee', value: 64496, format: 'currency', currency: 'USD' },
    { section: 'Expenses', label: 'Replacement Reserves', value: 55000, format: 'currency', currency: 'USD' },
    { section: 'Expenses', label: 'Total Operating Expenses', value: 511496, format: 'currency', currency: 'USD' },

    // --- Returns ------------------------------------------------------------
    { section: 'Returns', label: 'Net Operating Income', value: 1100904, format: 'currency', currency: 'USD' },
    { section: 'Returns', label: 'Gross Yield', value: 0.0876, format: 'percent' },
    { section: 'Returns', label: 'Net Yield / Cap Rate', value: 0.0595, format: 'percent' },
    { section: 'Returns', label: 'Cash-on-Cash Return (Yr 1)', value: 0.0712, format: 'percent' },
    { section: 'Returns', label: 'Projected 5-Yr IRR', value: 0.148, format: 'percent' },

    // --- Mandate compliance ----------------------------------------------------
    { section: 'Mandate Compliance', label: 'Max LTV Threshold', value: 0.75, format: 'percent' },
    { section: 'Mandate Compliance', label: 'LTV Compliant', value: 'PASS', format: 'text' },
    { section: 'Mandate Compliance', label: 'Min Gross Yield Threshold', value: 0.08, format: 'percent' },
    { section: 'Mandate Compliance', label: 'Gross Yield Compliant', value: 'PASS', format: 'text' },
  ],
};

// ---------------------------------------------------------------------------
// 3. exceljs writer — iterates the flat row list once, groups by section,
//    applies number formats per row so the output opens directly usable in
//    a standard CRE model rather than as a wall of unformatted numbers.
// ---------------------------------------------------------------------------

const EXCEL_NUMBER_FORMATS: Record<UnderwriteFieldFormat, string | undefined> = {
  currency: '$#,##0',
  percent: '0.00%',
  ratio: '0.00"x"',
  number: '#,##0',
  date: 'yyyy-mm-dd',
  text: undefined,
};

export async function buildUnderwriteWorkbook(
  payload: UnderwriteExportPayload
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Atlas REI';
  workbook.created = new Date(payload.meta.generatedAt);

  const sheet = workbook.addWorksheet('Underwriting Summary', {
    properties: { defaultColWidth: 28 },
  });

  sheet.columns = [
    { header: 'Section', key: 'section', width: 22 },
    { header: 'Line Item', key: 'label', width: 34 },
    { header: 'Value', key: 'value', width: 18 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({
    section: 'Meta',
    label: 'Property',
    value: payload.meta.propertyName,
  });
  sheet.addRow({
    section: 'Meta',
    label: 'Generated',
    value: payload.meta.generatedAt,
  });
  sheet.addRow({});

  let currentSection: string | null = null;

  for (const row of payload.rows) {
    if (row.section !== currentSection) {
      currentSection = row.section;
      const headerRow = sheet.addRow({ section: row.section.toUpperCase() });
      headerRow.font = { bold: true };
      headerRow.getCell('section').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE8ECEF' },
      };
    }

    const addedRow = sheet.addRow({
      section: '',
      label: row.label,
      value: row.value,
      notes: row.notes ?? '',
    });

    const valueCell = addedRow.getCell('value');
    const numFmt = EXCEL_NUMBER_FORMATS[row.format];
    if (numFmt) {
      valueCell.numFmt = numFmt;
    }

    // Preserve the citation trail: source span id goes into a cell comment,
    // not a visible column, so the export stays clean for the analyst but
    // an auditor can still right-click and trace it.
    if (row.sourceSpanId) {
      valueCell.note = `Source span: ${row.sourceSpanId} — trace in Atlas REI workspace`;
    }
  }

  return workbook;
}
