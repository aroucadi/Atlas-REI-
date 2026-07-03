import ExcelJS from 'exceljs';

export type UnderwriteFieldFormat =
  | 'currency'
  | 'percent'
  | 'number'
  | 'date'
  | 'text'
  | 'ratio';

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

const EXCEL_NUMBER_FORMATS: Record<UnderwriteFieldFormat, string | undefined> =
  {
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
      notes: row.kind === 'formula' ? (row.notes ?? '') : '',
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

const MONTH_COLUMNS = [
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
];
const TOTAL_COLUMN = 'P';
const FIRST_DATA_ROW = 5;

interface T12LineItemRow {
  label: string;
  monthlyValues: (number | null)[];
  sourceSpanId?: string | null;
}

function buildIncomeRows(income: any): T12LineItemRow[] {
  const rows: T12LineItemRow[] = [
    {
      label: 'Gross Potential Rent',
      monthlyValues: income.grossPotentialRent.monthlyValues,
      sourceSpanId: income.grossPotentialRent.spanId,
    },
    {
      label: 'Physical Vacancy Loss',
      monthlyValues: income.physicalVacancyLoss.monthlyValues,
      sourceSpanId: income.physicalVacancyLoss.spanId,
    },
    {
      label: 'Concessions',
      monthlyValues: income.concessionsLoss.monthlyValues,
      sourceSpanId: income.concessionsLoss.spanId,
    },
    {
      label: 'Bad Debt',
      monthlyValues: income.badDebtLoss.monthlyValues,
      sourceSpanId: income.badDebtLoss.spanId,
    },
    {
      label: 'Utility Chargeback Income',
      monthlyValues: income.utilityChargebackIncome.monthlyValues,
      sourceSpanId: income.utilityChargebackIncome.spanId,
    },
  ];
  for (const item of income.otherAncillaryIncome || []) {
    rows.push({
      label: item.category,
      monthlyValues: item.monthlyValues.monthlyValues,
      sourceSpanId: item.monthlyValues.spanId,
    });
  }
  return rows;
}

function buildExpenseRows(expenses: any): T12LineItemRow[] {
  const rows: T12LineItemRow[] = [
    {
      label: 'Property Taxes',
      monthlyValues: expenses.propertyTaxes.monthlyValues,
      sourceSpanId: expenses.propertyTaxes.spanId,
    },
    {
      label: 'Insurance',
      monthlyValues: expenses.insurance.monthlyValues,
      sourceSpanId: expenses.insurance.spanId,
    },
    {
      label: 'Repairs & Maintenance',
      monthlyValues: expenses.repairsAndMaintenance.monthlyValues,
      sourceSpanId: expenses.repairsAndMaintenance.spanId,
    },
    {
      label: 'Utilities (Owner-Paid)',
      monthlyValues: expenses.utilities.monthlyValues,
      sourceSpanId: expenses.utilities.spanId,
    },
    {
      label: 'Management Fees',
      monthlyValues: expenses.managementFees.monthlyValues,
      sourceSpanId: expenses.managementFees.spanId,
    },
    {
      label: 'Advertising & Marketing',
      monthlyValues: expenses.advertisingAndMarketing.monthlyValues,
      sourceSpanId: expenses.advertisingAndMarketing.spanId,
    },
    {
      label: 'Administrative',
      monthlyValues: expenses.administrativeCosts.monthlyValues,
      sourceSpanId: expenses.administrativeCosts.spanId,
    },
    {
      label: 'Payroll & Benefits',
      monthlyValues: expenses.payrollAndBenefits.monthlyValues,
      sourceSpanId: expenses.payrollAndBenefits.spanId,
    },
  ];
  for (const item of expenses.otherExpenses || []) {
    rows.push({
      label: item.category,
      monthlyValues: item.monthlyValues.monthlyValues,
      sourceSpanId: item.monthlyValues.spanId,
    });
  }
  return rows;
}

export function addHistoricalT12Sheet(
  workbook: ExcelJS.Workbook,
  t12: any,
  monthLabels: string[],
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Historical T-12', {
    properties: { defaultColWidth: 13 },
  });

  sheet.getColumn('A').width = 4;
  sheet.getColumn('B').width = 2;
  sheet.getColumn('C').width = 30;
  sheet.getColumn(TOTAL_COLUMN).width = 14;

  // --- Header ---
  sheet.mergeCells('A1:P1');
  sheet.getCell('A1').value =
    `${t12.propertyName?.value || 'Property'} — Trailing 12-Month Operating Statement`;
  sheet.getCell('A1').font = { bold: true, size: 13 };

  const headerRow = sheet.getRow(3);
  headerRow.getCell('C').value = 'Line Item';
  MONTH_COLUMNS.forEach((col, i) => {
    headerRow.getCell(col).value = monthLabels[i] ?? `M${i + 1}`;
  });
  headerRow.getCell(TOTAL_COLUMN).value = 'Total';
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF1E293B' },
    };
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  });

  let currentRow = FIRST_DATA_ROW;
  const incomeRowRange: number[] = [];
  const expenseRowRange: number[] = [];

  // --- Income section ---
  sheet.getCell(`C${currentRow}`).value = 'INCOME';
  sheet.getCell(`C${currentRow}`).font = { bold: true };
  currentRow++;

  for (const row of buildIncomeRows(t12.income)) {
    writeLineItemRow(sheet, currentRow, row);
    incomeRowRange.push(currentRow);
    currentRow++;
  }

  const totalIncomeRow = currentRow;
  sheet.getCell(`C${totalIncomeRow}`).value = 'Total Gross Revenue';
  sheet.getCell(`C${totalIncomeRow}`).font = { bold: true };
  MONTH_COLUMNS.forEach((col) => {
    const cell = sheet.getCell(`${col}${totalIncomeRow}`);
    cell.value = {
      formula: `SUM(${col}${incomeRowRange[0]}:${col}${incomeRowRange[incomeRowRange.length - 1]})`,
    };
    cell.numFmt = '$#,##0';
    cell.font = { bold: true };
  });
  sheet.getCell(`${TOTAL_COLUMN}${totalIncomeRow}`).value = {
    formula: `SUM(${MONTH_COLUMNS[0]}${totalIncomeRow}:${MONTH_COLUMNS[MONTH_COLUMNS.length - 1]}${totalIncomeRow})`,
  };
  sheet.getCell(`${TOTAL_COLUMN}${totalIncomeRow}`).numFmt = '$#,##0';
  sheet.getCell(`${TOTAL_COLUMN}${totalIncomeRow}`).font = { bold: true };
  currentRow += 2;

  // --- Expense section ---
  sheet.getCell(`C${currentRow}`).value = 'OPERATING EXPENSES';
  sheet.getCell(`C${currentRow}`).font = { bold: true };
  currentRow++;

  for (const row of buildExpenseRows(t12.expenses)) {
    writeLineItemRow(sheet, currentRow, row);
    expenseRowRange.push(currentRow);
    currentRow++;
  }

  const totalExpenseRow = currentRow;
  sheet.getCell(`C${totalExpenseRow}`).value = 'Total Operating Expenses';
  sheet.getCell(`C${totalExpenseRow}`).font = { bold: true };
  MONTH_COLUMNS.forEach((col) => {
    const cell = sheet.getCell(`${col}${totalExpenseRow}`);
    cell.value = {
      formula: `SUM(${col}${expenseRowRange[0]}:${col}${expenseRowRange[expenseRowRange.length - 1]})`,
    };
    cell.numFmt = '$#,##0';
    cell.font = { bold: true };
  });
  sheet.getCell(`${TOTAL_COLUMN}${totalExpenseRow}`).value = {
    formula: `SUM(${MONTH_COLUMNS[0]}${totalExpenseRow}:${MONTH_COLUMNS[MONTH_COLUMNS.length - 1]}${totalExpenseRow})`,
  };
  sheet.getCell(`${TOTAL_COLUMN}${totalExpenseRow}`).numFmt = '$#,##0';
  sheet.getCell(`${TOTAL_COLUMN}${totalExpenseRow}`).font = { bold: true };
  currentRow += 2;

  // --- NOI row ---
  const noiRow = currentRow;
  sheet.getCell(`C${noiRow}`).value = 'Net Operating Income (NOI)';
  sheet.getCell(`C${noiRow}`).font = { bold: true, size: 11 };
  MONTH_COLUMNS.forEach((col) => {
    const cell = sheet.getCell(`${col}${noiRow}`);
    cell.value = {
      formula: `${col}${totalIncomeRow}-${col}${totalExpenseRow}`,
    };
    cell.numFmt = '$#,##0';
    cell.font = { bold: true };
  });
  const noiTotalCell = sheet.getCell(`${TOTAL_COLUMN}${noiRow}`);
  noiTotalCell.value = {
    formula: `${TOTAL_COLUMN}${totalIncomeRow}-${TOTAL_COLUMN}${totalExpenseRow}`,
  };
  noiTotalCell.numFmt = '$#,##0';
  noiTotalCell.font = { bold: true };
  sheet.getRow(noiRow).eachCell((cell) => {
    cell.border = { top: { style: 'double' } };
  });
  currentRow += 2;

  // --- Reconciliation note ---
  if (
    t12.reportedTotals?.netOperatingIncome?.value !== null &&
    t12.reportedTotals?.netOperatingIncome?.value !== undefined
  ) {
    sheet.getCell(`C${currentRow}`).value =
      `Source document reported NOI: $${t12.reportedTotals.netOperatingIncome.value.toLocaleString()} (compare to computed total above)`;
    sheet.getCell(`C${currentRow}`).font = {
      italic: true,
      size: 9,
      color: { argb: 'FF64748B' },
    };
    currentRow++;
  }

  if (t12.discrepancyNotes && t12.discrepancyNotes.length > 0) {
    sheet.getCell(`C${currentRow}`).value =
      `Extraction notes: ${t12.discrepancyNotes.join(' | ')}`;
    sheet.getCell(`C${currentRow}`).font = {
      italic: true,
      size: 9,
      color: { argb: 'FFB45309' },
    };
  }

  return sheet;
}

function writeLineItemRow(
  sheet: ExcelJS.Worksheet,
  rowIndex: number,
  item: T12LineItemRow,
) {
  const row = sheet.getRow(rowIndex);
  row.getCell('C').value = item.label;

  MONTH_COLUMNS.forEach((col, i) => {
    const cell = row.getCell(col);
    cell.value = item.monthlyValues[i] ?? null;
    cell.numFmt = '$#,##0';
    cell.font = { color: { argb: 'FF1155CC' } }; // blue = raw extracted input
  });

  const totalCell = row.getCell(TOTAL_COLUMN);
  totalCell.value = {
    formula: `SUM(${MONTH_COLUMNS[0]}${rowIndex}:${MONTH_COLUMNS[MONTH_COLUMNS.length - 1]}${rowIndex})`,
  };
  totalCell.numFmt = '$#,##0';

  if (item.sourceSpanId) {
    row.getCell('C').note =
      `Source span: ${item.sourceSpanId} — trace in Atlas REI workspace`;
  }
}
