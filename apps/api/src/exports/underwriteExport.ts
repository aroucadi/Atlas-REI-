import ExcelJS from 'exceljs';

export type UnderwriteFieldFormat = 'currency' | 'percent' | 'number' | 'date' | 'text' | 'ratio';

export interface InputRow {
  kind: 'input';
  section: string;
  label: string;
  value: number | string | null;
  format: UnderwriteFieldFormat;
  currency?: string;
  sourceSpanId?: string | null;
  /** A stable key used by formula rows to reference this cell, e.g. 'purchasePrice'. */
  refKey: string;
}

export interface FormulaRow {
  kind: 'formula';
  section: string;
  label: string;
  format: UnderwriteFieldFormat;
  /**
   * Excel formula with {refKey} placeholders, resolved to actual cell
   * addresses at write time. Example: '={netOperatingIncome}/{purchasePrice}'
   */
  formulaTemplate: string;
  refKey: string;
  notes?: string;
}

export type UnderwriteExportRow = InputRow | FormulaRow;

export interface UnderwriteExportPayload {
  meta: {
    propertyName: string;
    workspaceId: string;
    underwriteRunId: string;
    generatedAt: string;
    analystName: string;
  };
  rows: UnderwriteExportRow[];
}

const EXCEL_NUMBER_FORMATS: Record<UnderwriteFieldFormat, string | undefined> = {
  currency: '$#,##0',
  percent: '0.00%',
  ratio: '0.00"x"',
  number: '#,##0',
  date: 'yyyy-mm-dd',
  text: undefined,
};

const VALUE_COLUMN = 'C'; // matches the sheet.columns layout below

export async function buildUnderwriteWorkbook(
  payload: UnderwriteExportPayload,
): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Atlas REI';
  workbook.created = new Date(payload.meta.generatedAt);

  const sheet = workbook.addWorksheet('Underwriting Model', {
    properties: { defaultColWidth: 28 },
  });

  sheet.columns = [
    { header: 'Section', key: 'section', width: 22 },
    { header: 'Line Item', key: 'label', width: 34 },
    { header: 'Value', key: 'value', width: 18 },
    { header: 'Notes', key: 'notes', width: 34 },
  ];
  sheet.getRow(1).font = { bold: true };

  sheet.addRow({ section: 'Meta', label: 'Property', value: payload.meta.propertyName });
  sheet.addRow({ section: 'Meta', label: 'Generated', value: payload.meta.generatedAt });
  sheet.addRow({});

  // Track which Excel row each refKey landed on, so later formula rows can
  // resolve their placeholders.
  const refKeyToCellAddress = new Map<string, string>();
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

    const excelRowIndex = sheet.rowCount + 1;
    const cellAddress = `${VALUE_COLUMN}${excelRowIndex}`;

    const addedRow = sheet.addRow({
      section: '',
      label: row.label,
      notes: row.kind === 'formula' ? row.notes ?? '' : '',
    });

    const valueCell = addedRow.getCell('value');
    const numFmt = EXCEL_NUMBER_FORMATS[row.format];
    if (numFmt) valueCell.numFmt = numFmt;

    if (row.kind === 'input') {
      valueCell.value = row.value ?? null;
      valueCell.font = { color: { argb: 'FF1155CC' } };
      if (row.sourceSpanId) {
        valueCell.note = `Source span: ${row.sourceSpanId} — trace in Atlas REI workspace`;
      }
    } else {
      const resolvedFormula = resolveFormulaTemplate(
        row.formulaTemplate,
        refKeyToCellAddress,
        row.refKey,
      );
      valueCell.value = { formula: resolvedFormula.slice(1) }; // exceljs wants the formula WITHOUT the leading '='
      valueCell.font = { color: { argb: 'FF000000' } };
    }

    refKeyToCellAddress.set(row.refKey, cellAddress);
  }

  return workbook;
}

function resolveFormulaTemplate(
  template: string,
  refKeyToCellAddress: Map<string, string>,
  currentRefKey: string,
): string {
  return template.replace(/\{(\w+)\}/g, (_, refKey: string) => {
    const address = refKeyToCellAddress.get(refKey);
    if (!address) {
      throw new Error(
        `Formula for "${currentRefKey}" references "${refKey}", which has not ` +
          `been written to the sheet yet. Formula rows must appear after every ` +
          `refKey they depend on in the payload.rows array.`,
      );
    }
    return address;
  });
}
