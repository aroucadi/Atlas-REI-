import { UnderwriteService } from './underwrite.service';

describe('UnderwriteService', () => {
  let service: UnderwriteService;

  beforeEach(() => {
    service = new UnderwriteService();
  });

  describe('Ongoing Expenses & Property Tax', () => {
    it('should include property tax in Spain (ES) but not in UAE (AE)', async () => {
      // Spain (EUR, 500k, 10% rent, tax = 0.5% of purchase price = 2500)
      const esResult = await service.underwrite({
        workspaceId: '00000000-0000-0000-0000-000000000000',
        countryCode: 'ES',
        currency: 'EUR',
        purchasePrice: 500000,
        grossRentalIncomeAnnual: 50000,
        serviceChargeValue: 1.5,
        serviceChargeUnit: 'per_sqm_monthly',
        interiorAreaSqm: 80,
        isOffPlan: false,
      });

      // Ongoing: propertyTax = 2500, serviceCharge = 1.5 * 12 * 80 = 1440, maintenance = 5000, management = 50000 * 0.08 = 4000
      // Total ongoing expenses: 2500 + 1440 + 5000 + 4000 = 12940 EUR
      // NOI: 50000 - 12940 = 37060 EUR
      // Net Yield: 37060 / 500000 = 7.41%
      expect(esResult.ongoingCosts.propertyTaxAnnual).toBe(2500);
      expect(esResult.ongoingCosts.totalOngoingCostsAnnual).toBe(12940);
      expect(esResult.metrics.netYield).toBeCloseTo(0.0741, 4);

      // UAE (AED, 1.2M, 96k rent, zero tax)
      const aeResult = await service.underwrite({
        workspaceId: '00000000-0000-0000-0000-000000000000',
        countryCode: 'AE',
        currency: 'AED',
        purchasePrice: 1200000,
        grossRentalIncomeAnnual: 96000,
        serviceChargeValue: 25,
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
        isOffPlan: false,
      });

      expect(aeResult.ongoingCosts.propertyTaxAnnual).toBe(0);
    });
  });

  describe('Currency Invariance', () => {
    it('should yield identical percentage yields regardless of input currency conversion scale', async () => {
      // UAE pack base currency is AED. Input in AED:
      const aedResult = await service.underwrite({
        workspaceId: '00000000-0000-0000-0000-000000000000',
        countryCode: 'AE',
        currency: 'AED',
        purchasePrice: 1200000,
        grossRentalIncomeAnnual: 96000,
        serviceChargeValue: 25,
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
        isOffPlan: false,
        financing: {
          downPaymentPct: 0.25,
          interestRate: 0.045,
          termMonths: 300,
        },
      });

      // Input in USD (converted to AED using rate 3.6725)
      // purchasePrice = 1200000 / 3.6725 = 326752.893
      // grossRentalIncome = 96000 / 3.6725 = 26140.2287
      const usdResult = await service.underwrite({
        workspaceId: '00000000-0000-0000-0000-000000000000',
        countryCode: 'AE',
        currency: 'USD',
        purchasePrice: 1200000 / 3.6725,
        grossRentalIncomeAnnual: 96000 / 3.6725,
        serviceChargeValue: 25,
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
        isOffPlan: false,
        financing: {
          downPaymentPct: 0.25,
          interestRate: 0.045,
          termMonths: 300,
        },
      });

      // Yield metrics must be mathematically invariant (identical)
      expect(usdResult.metrics.grossYield).toBeCloseTo(
        aedResult.metrics.grossYield,
        6,
      );
      expect(usdResult.metrics.netYield).toBeCloseTo(
        aedResult.metrics.netYield,
        6,
      );
      expect(usdResult.metrics.capRate).toBeCloseTo(
        aedResult.metrics.capRate,
        6,
      );
      expect(usdResult.metrics.cashOnCashYield).toBeCloseTo(
        aedResult.metrics.cashOnCashYield,
        6,
      );
      expect(usdResult.metrics.dscr!).toBeCloseTo(aedResult.metrics.dscr!, 6);
    });
  });

  describe('Unit Invariance', () => {
    it('should calculate identical service charges under equivalent unit types', async () => {
      // 25 AED per sqft annual is 25 * 10.7639 per sqm annual
      const sqftAnnualResult = await service.underwrite({
        workspaceId: '00000000-0000-0000-0000-000000000000',
        countryCode: 'AE',
        currency: 'AED',
        purchasePrice: 1200000,
        grossRentalIncomeAnnual: 96000,
        serviceChargeValue: 25,
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
      });

      const sqmAnnualResult = await service.underwrite({
        workspaceId: '00000000-0000-0000-0000-000000000000',
        countryCode: 'AE',
        currency: 'AED',
        purchasePrice: 1200000,
        grossRentalIncomeAnnual: 96000,
        serviceChargeValue: 25 * 10.7639,
        serviceChargeUnit: 'per_sqm_annual',
        interiorAreaSqm: 80,
      });

      expect(sqmAnnualResult.ongoingCosts.serviceChargeAnnual).toBeCloseTo(
        sqftAnnualResult.ongoingCosts.serviceChargeAnnual,
        2,
      );
    });
  });
});
