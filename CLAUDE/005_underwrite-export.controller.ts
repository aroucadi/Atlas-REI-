// apps/api/src/exports/underwrite-export.controller.ts
// apps/api/src/exports/underwrite-export.service.ts
//
// Split into controller + service per your existing convention. Both are
// included in this one file with clear section markers — split into two
// files when you paste into the repo.

// =============================================================================
// underwrite-export.service.ts
// =============================================================================

import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  buildUnderwriteWorkbook,
  UnderwriteExportPayload,
  UnderwriteExportRow,
} from './underwriteExport';
import ExcelJS from 'exceljs';

@Injectable()
export class UnderwriteExportService {
  constructor(private readonly prisma: PrismaService) {}

  async buildExportPayload(
    workspaceId: string,
    underwriteRunId: string,
  ): Promise<UnderwriteExportPayload> {
    // Adjust the include tree to your actual Prisma schema relations —
    // this assumes UnderwriteRun -> Property, -> MandateEvaluations,
    // and a normalized set of computed output fields. If your underwriting
    // outputs currently live as loose columns rather than a dedicated
    // results table, map from wherever that data actually lives; the shape
    // of buildRows() below is what matters, not the exact Prisma query.
    const run = await this.prisma.underwriteRun.findFirst({
      where: { id: underwriteRunId, workspaceId },
      include: {
        property: true,
        mandateEvaluations: {
          include: { mandate: true },
        },
        analyst: true,
      },
    });

    if (!run) {
      throw new NotFoundException(
        `Underwrite run ${underwriteRunId} not found in workspace ${workspaceId}`,
      );
    }

    if (run.status !== 'completed') {
      throw new ForbiddenException(
        `Underwrite run ${underwriteRunId} is not completed (status: ${run.status}). Export is only available for completed runs.`,
      );
    }

    return {
      meta: {
        propertyName: run.property.name,
        workspaceId,
        underwriteRunId: run.id,
        generatedAt: new Date().toISOString(),
        analystName: run.analyst?.fullName ?? 'Unknown',
      },
      rows: this.buildRows(run),
    };
  }

  private buildRows(run: any): UnderwriteExportRow[] {
    const rows: UnderwriteExportRow[] = [];

    // --- Acquisition ---------------------------------------------------------
    rows.push(
      { section: 'Acquisition', label: 'Purchase Price', value: run.purchasePrice, format: 'currency', currency: run.currency },
      { section: 'Acquisition', label: 'Price per Unit', value: run.pricePerUnit, format: 'currency', currency: run.currency },
      { section: 'Acquisition', label: 'Closing Costs', value: run.closingCosts, format: 'currency', currency: run.currency },
      { section: 'Acquisition', label: 'Total Capitalization', value: run.totalCapitalization, format: 'currency', currency: run.currency },
    );

    // --- Financing -------------------------------------------------------------
    rows.push(
      { section: 'Financing', label: 'Loan Amount', value: run.loanAmount, format: 'currency', currency: run.currency },
      { section: 'Financing', label: 'LTV', value: run.ltv, format: 'percent' },
      { section: 'Financing', label: 'Interest Rate', value: run.interestRate, format: 'percent' },
      { section: 'Financing', label: 'Amortization (months)', value: run.amortizationMonths, format: 'number' },
      { section: 'Financing', label: 'Term (months)', value: run.termMonths, format: 'number' },
      { section: 'Financing', label: 'DSCR', value: run.dscr, format: 'ratio' },
    );

    // --- Income ------------------------------------------------------------------
    rows.push(
      { section: 'Income', label: 'Gross Potential Rent (Annual)', value: run.grossPotentialRent, format: 'currency', currency: run.currency, sourceSpanId: run.grossPotentialRentSourceSpanId },
      { section: 'Income', label: 'Vacancy Loss', value: run.vacancyLoss, format: 'currency', currency: run.currency },
      { section: 'Income', label: 'Loss to Lease', value: run.lossToLease, format: 'currency', currency: run.currency },
      { section: 'Income', label: 'Utility Chargeback Income', value: run.utilityChargebackIncome, format: 'currency', currency: run.currency, sourceSpanId: run.utilityChargebackSourceSpanId },
      { section: 'Income', label: 'Other Income', value: run.otherIncome, format: 'currency', currency: run.currency },
      { section: 'Income', label: 'Effective Gross Income', value: run.effectiveGrossIncome, format: 'currency', currency: run.currency },
    );

    // --- Expenses -------------------------------------------------------------
    rows.push(
      { section: 'Expenses', label: 'Property Taxes', value: run.propertyTaxes, format: 'currency', currency: run.currency },
      { section: 'Expenses', label: 'Insurance', value: run.insurance, format: 'currency', currency: run.currency },
      { section: 'Expenses', label: 'Service Charges / CAM', value: run.serviceCharges, format: 'currency', currency: run.currency, sourceSpanId: run.serviceChargesSourceSpanId },
      { section: 'Expenses', label: 'Repairs & Maintenance', value: run.repairsMaintenance, format: 'currency', currency: run.currency },
      { section: 'Expenses', label: 'Management Fee', value: run.managementFee, format: 'currency', currency: run.currency },
      { section: 'Expenses', label: 'Replacement Reserves', value: run.replacementReserves, format: 'currency', currency: run.currency },
      { section: 'Expenses', label: 'Total Operating Expenses', value: run.totalOperatingExpenses, format: 'currency', currency: run.currency },
    );

    // --- Returns --------------------------------------------------------------
    rows.push(
      { section: 'Returns', label: 'Net Operating Income', value: run.netOperatingIncome, format: 'currency', currency: run.currency },
      { section: 'Returns', label: 'Gross Yield', value: run.grossYield, format: 'percent' },
      { section: 'Returns', label: 'Net Yield / Cap Rate', value: run.netYield, format: 'percent' },
      { section: 'Returns', label: 'Cash-on-Cash Return (Yr 1)', value: run.cashOnCashReturn, format: 'percent' },
      { section: 'Returns', label: 'Projected 5-Yr IRR', value: run.projectedIrr5yr, format: 'percent' },
    );

    // --- Mandate compliance, driven off mandateEvaluations relation ---------
    for (const evaluation of run.mandateEvaluations ?? []) {
      rows.push(
        {
          section: 'Mandate Compliance',
          label: `${evaluation.mandate.label} Threshold`,
          value: evaluation.thresholdValue,
          format: evaluation.mandate.valueType === 'percent' ? 'percent' : 'number',
        },
        {
          section: 'Mandate Compliance',
          label: `${evaluation.mandate.label} Result`,
          value: evaluation.passed ? 'PASS' : 'FAIL',
          format: 'text',
          notes: evaluation.passed ? undefined : evaluation.failureReason,
        },
      );
    }

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

// =============================================================================
// underwrite-export.controller.ts
// =============================================================================

import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { WorkspaceAccessGuard } from '../auth/workspace-access.guard'; // adapt to your existing guard
import { UnderwriteExportService } from './underwrite-export.service';

@Controller('workspaces/:workspaceId/underwrites')
@UseGuards(WorkspaceAccessGuard) // ensures caller is a member of :workspaceId — do not skip this
export class UnderwriteExportController {
  constructor(private readonly exportService: UnderwriteExportService) {}

  @Get(':id/export')
  async exportUnderwrite(
    @Param('workspaceId') workspaceId: string,
    @Param('id') underwriteRunId: string,
    @Res() res: Response,
  ) {
    const { workbook, fileName } = await this.exportService.buildWorkbook(
      workspaceId,
      underwriteRunId,
    );

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${fileName}"`,
    );

    // Stream directly to the response rather than buffering the whole
    // workbook in memory first — matters once rent rolls with hundreds of
    // units start flowing into these exports.
    await workbook.xlsx.write(res);
    res.end();
  }
}

// -----------------------------------------------------------------------------
// Module registration reminder (underwrite-export.module.ts):
//
// @Module({
//   imports: [PrismaModule, AuthModule],
//   controllers: [UnderwriteExportController],
//   providers: [UnderwriteExportService],
// })
// export class UnderwriteExportModule {}
// -----------------------------------------------------------------------------
