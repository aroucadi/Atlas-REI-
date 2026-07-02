import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class InstitutionalOutcomeAnalyzerService {
  constructor(private readonly db: DatabaseService) {}

  async analyzeDrifts(workspaceId: string, propertyId: string) {
    // 1. Fetch latest UnderwriteRun
    const underwrite = await this.db.client.underwriteRun.findFirst({
      where: { workspaceId, propertyId },
      orderBy: { createdAt: 'desc' },
    });

    if (!underwrite) {
      throw new BadRequestException(
        'No underwriting estimates found for this property.',
      );
    }

    const metrics = (underwrite.metricsJson as any) || {};
    const estimatedYield = metrics.estimatedYield ?? 0.08; // fallback to 8%

    // 2. Fetch actual SaleTransaction & RentalTransaction
    const sale = await this.db.client.saleTransaction.findFirst({
      where: { propertyId },
      orderBy: { transactionDate: 'desc' },
    });

    const rent = await this.db.client.rentalTransaction.findFirst({
      where: { propertyId },
      orderBy: { contractStartDate: 'desc' },
    });

    if (!sale || !rent) {
      return {
        propertyId,
        message: 'Insufficient transaction data to compute actual outcomes.',
        estimatedYield,
        actualYield: null,
        yieldDrift: null,
        forecastingError: null,
      };
    }

    const purchasePrice = Number(sale.priceAmount);
    const annualRent = Number(rent.annualRentAmount);

    if (purchasePrice <= 0 || annualRent <= 0) {
      throw new BadRequestException(
        'Invalid transaction price or rent amount.',
      );
    }

    const actualYield = +(annualRent / purchasePrice).toFixed(4);
    const yieldDrift = +(actualYield - estimatedYield).toFixed(4);
    const forecastingError = +(
      (estimatedYield - actualYield) /
      actualYield
    ).toFixed(4);

    return {
      propertyId,
      estimatedYield,
      actualYield,
      yieldDrift,
      forecastingError,
    };
  }
}
