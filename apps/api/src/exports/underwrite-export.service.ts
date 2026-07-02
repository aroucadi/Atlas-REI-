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
    const subMetrics = metricsObj.metrics || {};
    const currency = assumptions.currency || 'USD';

    // --- Acquisition ---------------------------------------------------------
    rows.push(
      { section: 'Acquisition', label: 'Purchase Price', value: assumptions.purchasePrice || 0, format: 'currency', currency },
      { section: 'Acquisition', label: 'Price per Unit', value: assumptions.purchasePrice || 0, format: 'currency', currency },
      { section: 'Acquisition', label: 'Closing Costs', value: (metricsObj.totalAcquisitionCosts || assumptions.purchasePrice || 0) - (assumptions.purchasePrice || 0), format: 'currency', currency },
      { section: 'Acquisition', label: 'Total Capitalization', value: metricsObj.totalCapitalRequired || assumptions.purchasePrice || 0, format: 'currency', currency },
    );

    // --- Financing -------------------------------------------------------------
    const loanAmount = (assumptions.purchasePrice || 0) - (subMetrics.equityInvested || 0);
    const ltv = assumptions.financing ? (1 - (assumptions.financing.downPaymentPct || 1.0)) : 0;
    rows.push(
      { section: 'Financing', label: 'Loan Amount', value: loanAmount, format: 'currency', currency },
      { section: 'Financing', label: 'LTV', value: ltv, format: 'percent' },
      { section: 'Financing', label: 'Interest Rate', value: assumptions.financing?.interestRate || 0, format: 'percent' },
      { section: 'Financing', label: 'Amortization (months)', value: assumptions.financing?.termMonths || 0, format: 'number' },
      { section: 'Financing', label: 'Term (months)', value: assumptions.financing?.termMonths || 0, format: 'number' },
      { section: 'Financing', label: 'DSCR', value: subMetrics.dscr || null, format: 'ratio' },
    );

    // --- Income ------------------------------------------------------------------
    const grossIncome = assumptions.grossRentalIncomeAnnual || 0;
    rows.push(
      { section: 'Income', label: 'Gross Potential Rent (Annual)', value: grossIncome, format: 'currency', currency },
      { section: 'Income', label: 'Vacancy Loss', value: metricsObj.vacancyLoss || 0, format: 'currency', currency },
      { section: 'Income', label: 'Loss to Lease', value: metricsObj.lossToLease || 0, format: 'currency', currency },
      { section: 'Income', label: 'Utility Chargeback Income', value: metricsObj.utilityChargebackIncome || 0, format: 'currency', currency },
      { section: 'Income', label: 'Other Income', value: metricsObj.otherIncome || 0, format: 'currency', currency },
      { section: 'Income', label: 'Effective Gross Income', value: metricsObj.effectiveGrossIncome || grossIncome, format: 'currency', currency },
    );

    // --- Expenses -------------------------------------------------------------
    rows.push(
      { section: 'Expenses', label: 'Property Taxes', value: metricsObj.propertyTaxes || 0, format: 'currency', currency },
      { section: 'Expenses', label: 'Insurance', value: metricsObj.insurance || 0, format: 'currency', currency },
      { section: 'Expenses', label: 'Service Charges / CAM', value: assumptions.serviceChargeValue || 0, format: 'currency', currency },
      { section: 'Expenses', label: 'Repairs & Maintenance', value: metricsObj.repairsMaintenance || 0, format: 'currency', currency },
      { section: 'Expenses', label: 'Management Fee', value: metricsObj.managementFee || 0, format: 'currency', currency },
      { section: 'Expenses', label: 'Replacement Reserves', value: metricsObj.replacementReserves || 0, format: 'currency', currency },
      { section: 'Expenses', label: 'Total Operating Expenses', value: metricsObj.totalOperatingExpenses || 0, format: 'currency', currency },
    );

    // --- Returns --------------------------------------------------------------
    rows.push(
      { section: 'Returns', label: 'Net Operating Income', value: subMetrics.netOperatingIncome || 0, format: 'currency', currency },
      { section: 'Returns', label: 'Gross Yield', value: subMetrics.grossYield || 0, format: 'percent' },
      { section: 'Returns', label: 'Net Yield / Cap Rate', value: subMetrics.netYield || subMetrics.capRate || 0, format: 'percent' },
      { section: 'Returns', label: 'Cash-on-Cash Return (Yr 1)', value: subMetrics.cashOnCashYield || 0, format: 'percent' },
      { section: 'Returns', label: 'Projected 5-Yr IRR', value: subMetrics.projectedIrr5yr || subMetrics.cashOnCashYield || 0, format: 'percent' },
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
