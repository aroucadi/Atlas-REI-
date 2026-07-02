import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { CountryPackRegistry } from '@atlas/country-pack';

@Injectable()
export class DealFinderService {
  constructor(private readonly db: DatabaseService) {}

  private convertCurrency(amount: number, from: string, to: string): number {
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    if (f === t) return amount;
    // Simple conversion rates for AED and EUR in Atlas REI
    if (f === 'AED' && t === 'EUR') return amount / 4.0;
    if (f === 'EUR' && t === 'AED') return amount * 4.0;
    return amount;
  }

  async searchDeals(workspaceId: string, profileId?: string) {
    // 1. Fetch the active profile
    let profile;
    if (profileId) {
      profile = await this.db.client.investorProfile.findFirst({
        where: { id: profileId, workspaceId },
      });
    } else {
      profile = await this.db.client.investorProfile.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!profile) {
      throw new NotFoundException(
        `No investor profile found for workspace ${workspaceId}. Please create one first.`,
      );
    }

    const capitalAvailable = Number(profile.capitalAvailable);
    const riskTolerance = profile.riskTolerance;
    const incomeVsGrowthPreference = profile.incomeVsGrowthPreference;
    const financingPreference = profile.financingPreference;
    const targetCountries = (profile.targetCountriesJson as string[]) || [];

    // 2. Fetch all properties with their active listings, buildings, and countrypack
    const properties = await this.db.client.property.findMany({
      include: {
        building: {
          include: {
            city: true,
            district: true,
          },
        },
        country: true,
        listings: {
          where: {
            listingStatus: 'active',
            listingType: 'sale',
          },
        },
      },
    });

    const matches: any[] = [];

    for (const property of properties) {
      // Must have active listing to buy
      const listing = property.listings[0];
      if (!listing) continue;
      if (!property.country) continue;

      const purchasePrice = Number(listing.priceAmount);
      const currency = listing.priceCurrency || 'AED';

      // Determine off-plan status
      const isOffPlan =
        property.propertyType === 'off-plan' ||
        property.building?.name?.toLowerCase().includes('off-plan') ||
        false;

      // Load country pack to compute acquisition costs
      let pack;
      try {
        pack = CountryPackRegistry.getPack(property.country.countryCode);
      } catch {
        // Fallback if country pack not registered
        continue;
      }

      const useMortgage =
        financingPreference === 'mortgage' ||
        financingPreference === 'flexible';
      const costs = pack.calculateAcquisitionCosts(purchasePrice, {
        isOffPlan,
        isMortgage: useMortgage,
      });

      // Total cash required to buy
      let cashRequired = 0;
      if (useMortgage) {
        // Down payment (e.g. 25% of purchase price) + all transaction costs
        cashRequired = purchasePrice * 0.25 + costs.totalAcquisitionCosts;
      } else {
        // 100% cash + all transaction costs
        cashRequired = purchasePrice + costs.totalAcquisitionCosts;
      }

      // Convert cash required to profile's base currency to compare
      const cashRequiredConverted = this.convertCurrency(
        cashRequired,
        currency,
        profile.baseCurrency,
      );

      // Filter: If cash required exceeds investor's capital, disqualify
      if (cashRequiredConverted > capitalAvailable) {
        continue;
      }

      // Calculate matching score (base 75)
      let matchScore = 75;

      // 1. Budget occupancy penalty/bonus
      const budgetRatio = cashRequiredConverted / capitalAvailable;
      if (budgetRatio > 0.9) {
        matchScore -= 15; // too close to total capital limit
      } else if (budgetRatio < 0.4) {
        matchScore += 10; // leaves plenty of liquidity
      }

      // 2. Risk tolerance match
      if (riskTolerance === 'conservative') {
        if (isOffPlan) matchScore -= 20;
        else matchScore += 10;
      } else if (riskTolerance === 'aggressive') {
        if (isOffPlan) matchScore += 15;
      }

      // 3. Location preference
      if (targetCountries.length > 0) {
        if (targetCountries.includes(property.country.countryCode)) {
          matchScore += 10;
        } else {
          matchScore -= 30; // country not in target countries list
        }
      }

      // ⚠️ PROXY YIELD ESTIMATE — NOT market data
      // Uses a simplified formula (area × base_rate × 12) because real rental
      // market data integration is not yet available. Consumers MUST label
      // this as "Proxy Yield" and not "Estimated Yield" or "Market Yield".
      // AE base rate: 200 AED/sqm/month, ES base rate: 15 EUR/sqm/month
      const area = property.interiorAreaSqm
        ? Number(property.interiorAreaSqm)
        : 0;
      const annualRent = area
        ? area * (property.country.countryCode === 'AE' ? 200 : 15) * 12
        : 0;
      const grossYield =
        purchasePrice > 0 ? (annualRent / purchasePrice) * 100 : 0;

      if (incomeVsGrowthPreference === 'income') {
        if (grossYield > 7) matchScore += 10;
        else if (grossYield < 4) matchScore -= 10;
      } else if (incomeVsGrowthPreference === 'growth') {
        if (isOffPlan) matchScore += 10; // off-plan is preferred for capital growth
      }

      // Ensure score stays in [0, 100]
      const finalScore = Math.max(0, Math.min(100, matchScore));

      matches.push({
        property: {
          id: property.id,
          propertyType: property.propertyType,
          interiorAreaSqm: property.interiorAreaSqm,
          building: property.building,
          country: property.country,
        },
        listing: {
          id: listing.id,
          priceAmount: purchasePrice,
          priceCurrency: currency,
        },
        matchingDetails: {
          cashRequired,
          cashRequiredConverted,
          acquisitionCosts: costs.totalAcquisitionCosts,
          dldOrTransferTax: costs.transferTaxOrDldFee,
          registrationFee: costs.registrationFee,
          brokerFee: costs.brokerFee,
          grossYieldEstimate: Number(grossYield.toFixed(2)),
          yieldSource: 'proxy_formula',
          useMortgage,
          ltvPercentage: useMortgage ? 75 : 0,
        },
        matchScore: finalScore,
        _dataQuality: {
          yieldMethod: 'proxy_formula',
          yieldDisclaimer:
            'Yield is estimated using a fixed rent-per-sqm proxy, not sourced from real market data.',
          conversionMethod: 'static_rate',
        },
      });
    }

    // Sort by match score descending
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }
}
