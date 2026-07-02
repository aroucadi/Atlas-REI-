import { Injectable, BadRequestException } from '@nestjs/common';
import { CountryPackRegistry } from '@atlas/country-pack';
import { underwriteDeal } from '@atlas/financial-core';
import { UnderwritePropertyInput } from '@atlas/shared-types';
import { DatabaseService } from '../database/database.service';
import { ForexService } from '../event/forex.service';

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
  USD: { AED: 3.6725, EUR: 0.92, USD: 1 },
  AED: { USD: 1 / 3.6725, EUR: 0.92 / 3.6725, AED: 1 },
  EUR: { USD: 1 / 0.92, AED: 3.6725 / 0.92, EUR: 1 },
};

@Injectable()
export class UnderwriteService {
  constructor(
    private readonly db?: DatabaseService,
    private readonly forexService?: ForexService,
  ) {}

  async underwrite(input: UnderwritePropertyInput) {
    try {
      if (this.db && input.propertyId) {
        const propertyExists = await this.db.client.property.findUnique({
          where: { id: input.propertyId },
          include: { country: true },
        });
        if (!propertyExists) {
          throw new BadRequestException('Property not found');
        }
        if (
          propertyExists.country &&
          propertyExists.country.countryCode !== input.countryCode
        ) {
          throw new BadRequestException(
            `Property country code mismatch: property is in ${propertyExists.country.countryCode} but underwrite requested ${input.countryCode}`,
          );
        }
      }

      // Look up country pack
      const pack = CountryPackRegistry.getPack(input.countryCode);

      // Convert currency if it differs from the country pack's base currency
      let purchasePrice = input.purchasePrice;
      let grossIncome = input.grossRentalIncomeAnnual;

      if (input.currency !== pack.baseCurrency) {
        if (this.forexService) {
          purchasePrice = await this.forexService.convert(
            input.purchasePrice,
            input.currency,
            pack.baseCurrency,
          );
          grossIncome = await this.forexService.convert(
            input.grossRentalIncomeAnnual,
            input.currency,
            pack.baseCurrency,
          );
        } else {
          const rates = EXCHANGE_RATES[input.currency];
          const rate = rates ? rates[pack.baseCurrency] : undefined;
          if (!rate) {
            throw new BadRequestException(
              `Unsupported currency conversion from ${input.currency} to ${pack.baseCurrency}`,
            );
          }
          purchasePrice = purchasePrice * rate;
          grossIncome = grossIncome * rate;
        }
      }

      // Resolve and normalize service charge value and unit
      let serviceChargePerSqm = 0;
      let serviceChargeValue = input.serviceChargeValue;
      let serviceChargeUnit = input.serviceChargeUnit;

      if (serviceChargeValue !== undefined) {
        if (serviceChargeUnit === 'per_sqm_annual') {
          serviceChargePerSqm = serviceChargeValue;
        } else if (serviceChargeUnit === 'per_sqft_annual') {
          serviceChargePerSqm = serviceChargeValue * 10.7639;
        } else if (serviceChargeUnit === 'per_sqm_monthly') {
          serviceChargePerSqm = serviceChargeValue * 12;
        } else if (serviceChargeUnit === 'per_sqft_monthly') {
          serviceChargePerSqm = serviceChargeValue * 10.7639 * 12;
        }
      } else if (input.serviceChargePerSqm !== undefined) {
        // Backward compatibility fallback
        serviceChargeValue = input.serviceChargePerSqm;
        if (input.countryCode === 'AE') {
          serviceChargeUnit = 'per_sqft_annual';
          serviceChargePerSqm = input.serviceChargePerSqm * 10.7639;
        } else {
          serviceChargeUnit = 'per_sqm_monthly';
          serviceChargePerSqm = input.serviceChargePerSqm * 12;
        }
      } else {
        // Defaults if none provided
        if (input.countryCode === 'AE') {
          serviceChargeValue = 25;
          serviceChargeUnit = 'per_sqft_annual';
          serviceChargePerSqm = 25 * 10.7639;
        } else {
          serviceChargeValue = 1.5;
          serviceChargeUnit = 'per_sqm_monthly';
          serviceChargePerSqm = 1.5 * 12;
        }
      }

      // 1. Calculate localized acquisition costs (taxes, registration fees, agency commissions)
      const acquisition = pack.calculateAcquisitionCosts(purchasePrice, {
        isOffPlan: input.isOffPlan,
        isMortgage: !!input.financing,
      });

      // 2. Calculate localized ongoing costs (maintenance, service charges, taxes)
      const ongoing = pack.calculateOngoingCosts(purchasePrice, grossIncome, {
        serviceChargePerSqm,
        interiorAreaSqm: input.interiorAreaSqm,
      });

      // 3. Calculate total operating expenses
      const totalExpenses =
        ongoing.serviceChargeAnnual +
        ongoing.maintenanceAnnual +
        ongoing.managementFeeAnnual +
        ongoing.propertyTaxAnnual;

      // 4. Invoke deterministic financial core math engine
      const metrics = underwriteDeal({
        purchasePrice,
        grossRentalIncomeAnnual: grossIncome,
        operatingExpensesAnnual: totalExpenses,
        downPaymentPct: input.financing?.downPaymentPct ?? 1.0,
        loanInterestRate: input.financing?.interestRate,
        loanTermMonths: input.financing?.termMonths,
      });

      const result = {
        countryCode: input.countryCode,
        currency: pack.baseCurrency,
        purchasePrice,
        totalAcquisitionCosts: acquisition.totalAcquisitionCosts,
        totalCapitalRequired:
          metrics.equityInvested + acquisition.totalAcquisitionCosts,
        acquisitionFees: acquisition,
        acquisitionCostsDetails: acquisition,
        ongoingCosts: ongoing,
        metrics,
        serviceChargeValue,
        serviceChargeUnit,
      };

      if (this.db && input.workspaceId && input.propertyId) {
        const assumptions = {
          purchasePrice: input.purchasePrice,
          grossRentalIncomeAnnual: input.grossRentalIncomeAnnual,
          currency: input.currency,
          serviceChargeValue: input.serviceChargeValue,
          serviceChargeUnit: input.serviceChargeUnit,
          interiorAreaSqm: input.interiorAreaSqm,
          isOffPlan: input.isOffPlan,
          financing: input.financing,
        };

        const run = await this.db.client.underwriteRun.create({
          data: {
            workspaceId: input.workspaceId,
            propertyId: input.propertyId,
            assumptionsJson: assumptions as any,
            metricsJson: result as any,
          },
        });

        return {
          ...result,
          id: run.id,
        };
      }

      return result;
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }
}
