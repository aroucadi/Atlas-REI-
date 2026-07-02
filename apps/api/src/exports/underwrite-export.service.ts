import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  buildUnderwriteWorkbook,
  UnderwriteExportPayload,
  UnderwriteExportRow,
} from './underwriteExport';
import ExcelJS from 'exceljs';

@Injectable()
export class UnderwriteExportService {
  constructor(private readonly db: DatabaseService) {}

  async buildExportPayload(
    workspaceId: string,
    underwriteRunId: string,
  ): Promise<UnderwriteExportPayload> {
    const run = await this.db.client.underwriteRun.findFirst({
      where: { id: underwriteRunId, workspaceId },
      include: {
        property: true,
      },
    });

    if (!run) {
      throw new NotFoundException(
        `Underwrite run ${underwriteRunId} not found in workspace ${workspaceId}`,
      );
    }

    // Since we don't have direct analyst or mandate relations in schema.prisma for UnderwriteRun yet,
    // we fetch them or default them to keep it robust and buildable.
    return {
      meta: {
        propertyName: run.property.externalPropertyRef || run.property.propertyType,
        workspaceId,
        underwriteRunId: run.id,
        generatedAt: new Date().toISOString(),
        analystName: 'Acquisitions Analyst',
      },
      rows: this.buildRows(run),
    };
  }

  private buildRows(run: any): UnderwriteExportRow[] {
    const rows: UnderwriteExportRow[] = [];
    const assumptions = (run.assumptionsJson as any) || {};
    const metricsObj = (run.metricsJson as any) || {};
    const currency = assumptions.currency || 'USD';

    // --- Acquisition ---------------------------------------------------------
    rows.push(
      { kind: 'input', section: 'Acquisition', label: 'Purchase Price', value: assumptions.purchasePrice || 0, format: 'currency', currency, refKey: 'purchasePrice' },
      { kind: 'input', section: 'Acquisition', label: 'Unit Count', value: assumptions.unitCount || 1, format: 'number', refKey: 'unitCount' },
      { kind: 'input', section: 'Acquisition', label: 'Closing Costs', value: (metricsObj.totalAcquisitionCosts || assumptions.purchasePrice || 0) - (assumptions.purchasePrice || 0), format: 'currency', currency, refKey: 'closingCosts' },
      { kind: 'formula', section: 'Acquisition', label: 'Price per Unit', format: 'currency', formulaTemplate: '={purchasePrice}/{unitCount}', refKey: 'pricePerUnit' },
      { kind: 'formula', section: 'Acquisition', label: 'Total Capitalization', format: 'currency', formulaTemplate: '={purchasePrice}+{closingCosts}', refKey: 'totalCapitalization' },
    );

    // --- Financing -------------------------------------------------------------
    const ltv = assumptions.financing ? (1 - (assumptions.financing.downPaymentPct || 1.0)) : 0;
    const interestRate = assumptions.financing?.interestRate || 0;
    const termMonths = assumptions.financing?.termMonths || 360;
    rows.push(
      { kind: 'input', section: 'Financing', label: 'LTV', value: ltv, format: 'percent', refKey: 'ltv' },
      { kind: 'input', section: 'Financing', label: 'Interest Rate', value: interestRate, format: 'percent', refKey: 'interestRate' },
      { kind: 'input', section: 'Financing', label: 'Amortization (months)', value: termMonths, format: 'number', refKey: 'amortMonths' },
      { kind: 'formula', section: 'Financing', label: 'Loan Amount', format: 'currency', formulaTemplate: '={purchasePrice}*{ltv}', refKey: 'loanAmount' },
      { kind: 'formula', section: 'Financing', label: 'Monthly Debt Service', format: 'currency', formulaTemplate: '=-PMT({interestRate}/12,{amortMonths},{loanAmount})', refKey: 'monthlyDebtService' },
      { kind: 'formula', section: 'Financing', label: 'Annual Debt Service', format: 'currency', formulaTemplate: '={monthlyDebtService}*12', refKey: 'annualDebtService' },
      { kind: 'formula', section: 'Financing', label: 'DSCR', format: 'ratio', formulaTemplate: '={netOperatingIncome}/{annualDebtService}', refKey: 'dscr' },
    );

    // --- Income ------------------------------------------------------------------
    const grossIncome = assumptions.grossRentalIncomeAnnual || 0;
    const vacancyRate = metricsObj.vacancyRate || 0.05;
    const utilityChargeback = metricsObj.utilityChargebackIncome || 0;
    const otherIncome = metricsObj.otherIncome || 0;
    rows.push(
      { kind: 'input', section: 'Income', label: 'Gross Potential Rent (Annual)', value: grossIncome, format: 'currency', currency, refKey: 'grossPotentialRent' },
      { kind: 'input', section: 'Income', label: 'Vacancy Rate', value: vacancyRate, format: 'percent', refKey: 'vacancyRate' },
      { kind: 'input', section: 'Income', label: 'Utility Chargeback Income', value: utilityChargeback, format: 'currency', currency, refKey: 'utilityChargebackIncome' },
      { kind: 'input', section: 'Income', label: 'Other Income', value: otherIncome, format: 'currency', currency, refKey: 'otherIncome' },
      { kind: 'formula', section: 'Income', label: 'Vacancy Loss', format: 'currency', formulaTemplate: '=-({grossPotentialRent}*{vacancyRate})', refKey: 'vacancyLoss' },
      { kind: 'formula', section: 'Income', label: 'Effective Gross Income', format: 'currency', formulaTemplate: '={grossPotentialRent}+{vacancyLoss}+{utilityChargebackIncome}+{otherIncome}', refKey: 'effectiveGrossIncome' },
    );

    // --- Expenses -------------------------------------------------------------
    const propTaxes = metricsObj.propertyTaxes || 0;
    const insurance = metricsObj.insurance || 0;
    const serviceCharges = assumptions.serviceChargeValue || 0;
    const repairsMaint = metricsObj.repairsMaintenance || 0;
    const managementFeePct = metricsObj.managementFeePct || 0.04;
    const replacementReserves = metricsObj.replacementReserves || 0;
    rows.push(
      { kind: 'input', section: 'Expenses', label: 'Property Taxes', value: propTaxes, format: 'currency', currency, refKey: 'propertyTaxes' },
      { kind: 'input', section: 'Expenses', label: 'Insurance', value: insurance, format: 'currency', currency, refKey: 'insurance' },
      { kind: 'input', section: 'Expenses', label: 'Service Charges / CAM', value: serviceCharges, format: 'currency', currency, refKey: 'serviceCharges' },
      { kind: 'input', section: 'Expenses', label: 'Repairs & Maintenance', value: repairsMaint, format: 'currency', currency, refKey: 'repairsMaintenance' },
      { kind: 'input', section: 'Expenses', label: 'Management Fee %', value: managementFeePct, format: 'percent', refKey: 'managementFeePct' },
      { kind: 'input', section: 'Expenses', label: 'Replacement Reserves', value: replacementReserves, format: 'currency', currency, refKey: 'replacementReserves' },
      { kind: 'formula', section: 'Expenses', label: 'Management Fee', format: 'currency', formulaTemplate: '={effectiveGrossIncome}*{managementFeePct}', refKey: 'managementFee' },
      { kind: 'formula', section: 'Expenses', label: 'Total Operating Expenses', format: 'currency', formulaTemplate: '={propertyTaxes}+{insurance}+{serviceCharges}+{repairsMaintenance}+{managementFee}+{replacementReserves}', refKey: 'totalOperatingExpenses' },
    );

    // --- Returns --------------------------------------------------------------
    rows.push(
      { kind: 'formula', section: 'Returns', label: 'Net Operating Income', format: 'currency', formulaTemplate: '={effectiveGrossIncome}-{totalOperatingExpenses}', refKey: 'netOperatingIncome' },
      { kind: 'formula', section: 'Returns', label: 'Net Rental Yield', format: 'percent', formulaTemplate: '={netOperatingIncome}/{purchasePrice}', refKey: 'netRentalYield', notes: 'NOI / Purchase Price' },
      { kind: 'formula', section: 'Returns', label: 'Gross Yield', format: 'percent', formulaTemplate: '={grossPotentialRent}/{purchasePrice}', refKey: 'grossYield' },
      { kind: 'formula', section: 'Returns', label: 'Cash-on-Cash Yield', format: 'percent', formulaTemplate: '=({netOperatingIncome}-{annualDebtService})/({purchasePrice}-{loanAmount}+{closingCosts})', refKey: 'cashOnCashYield', notes: '(NOI - Annual Debt Service) / Total Cash Invested' },
    );

    return rows;
  }

  async buildWorkbook(
    workspaceId: string,
    underwriteRunId: string,
  ): Promise<{ workbook: ExcelJS.Workbook; fileName: string }> {
    const payload = await this.buildExportPayload(workspaceId, underwriteRunId);
    const workbook = await buildUnderwriteWorkbook(payload);
    const fileName = `${payload.meta.propertyName.replace(/[^a-z0-9]+/gi, '_')}_underwrite.xlsx`;
    return { workbook, fileName };
  }
}
