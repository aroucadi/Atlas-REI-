import { z } from "zod";

export interface CountryPack {
  countryCode: string; // ISO 2-letter code, e.g. "AE", "ES"
  name: string;
  baseCurrency: string; // e.g. "AED", "EUR"
  timezone: string; // e.g. "Asia/Dubai", "Europe/Madrid"

  /**
   * Calculates local acquisition costs (taxes, registration fees, broker fees, etc.)
   */
  calculateAcquisitionCosts(
    purchasePrice: number,
    options?: {
      isOffPlan?: boolean;
      isMortgage?: boolean;
      brokerFeePct?: number;
    },
  ): {
    transferTaxOrDldFee: number;
    registrationFee: number;
    brokerFee: number;
    trusteeFee: number;
    totalAcquisitionCosts: number;
  };

  /**
   * Calculates local ongoing costs (property tax, local service charges, etc.)
   */
  calculateOngoingCosts(
    purchasePrice: number,
    annualRent: number,
    options?: {
      serviceChargePerSqm?: number;
      interiorAreaSqm?: number;
      managementFeePct?: number;
    },
  ): {
    propertyTaxAnnual: number;
    serviceChargeAnnual: number;
    maintenanceAnnual: number;
    managementFeeAnnual: number;
    totalOngoingCostsAnnual: number;
  };

  /**
   * Validates dynamic localized property metadata
   */
  validatePropertyMetadata(metadata: Record<string, any>): {
    success: boolean;
    data?: any;
    errors?: string[];
  };
}

/**
 * Zod Schemas for local market metadata validation
 */
export const UaePropertyMetadataSchema = z.object({
  ejariNumber: z.string().optional(),
  titleDeedNumber: z.string().optional(),
  dldPermitNumber: z.string().optional(),
  developerName: z.string().optional(),
  projectStatus: z.enum(["off-plan", "completed"]).optional(),
  viewCone: z.string().optional(), // Building view type, e.g. "Burj Khalifa view", "Marina view"
  h3Index: z.string().length(15).optional(), // Res 9/10 H3 spatial grid
});

export const SpainPropertyMetadataSchema = z.object({
  referenciaCatastral: z.string().optional(),
  certificadoEficienciaEnergetica: z.string().optional(), // Energy rating A-G
  comunidadGastosMonthly: z.number().optional(), // Community fees
  ibiAnnual: z.number().optional(), // Property tax (IBI)
  h3Index: z.string().length(15).optional(),
});

/**
 * United Arab Emirates (UAE) Country Pack Implementation
 */
export class UaeCountryPack implements CountryPack {
  countryCode = "AE";
  name = "United Arab Emirates";
  baseCurrency = "AED";
  timezone = "Asia/Dubai";

  calculateAcquisitionCosts(
    purchasePrice: number,
    options?: {
      isOffPlan?: boolean;
      isMortgage?: boolean;
      brokerFeePct?: number;
    },
  ) {
    const isOffPlan = options?.isOffPlan ?? false;
    const isMortgage = options?.isMortgage ?? false;
    const brokerFeePct = options?.brokerFeePct ?? 0.02; // Default 2% agency fee in Dubai

    // Dubai Land Department (DLD) transfer fee is 4% of property value
    const transferTaxOrDldFee = purchasePrice * 0.04;

    // Dubai Trustee fees: Completed: AED 4,000 + VAT; Off-plan: AED 5,000 + VAT (approximate averages)
    const trusteeFee = isOffPlan ? 5250 : 4200;

    // Broker agency fee (usually 2% + VAT)
    const brokerFee = purchasePrice * brokerFeePct * 1.05;

    // DLD Registration fees (under/above 500k AED)
    let registrationFee = 0;
    if (purchasePrice < 500000) {
      registrationFee = 2000 * 1.05;
    } else {
      registrationFee = 4000 * 1.05;
    }

    // Additional mortgage registration fee if financed (0.25% of loan + AED 290)
    let mortgageRegFee = 0;
    if (isMortgage) {
      const loanAmount = purchasePrice * 0.75; // Assume 75% LTV
      mortgageRegFee = loanAmount * 0.0025 + 290;
    }

    const totalAcquisitionCosts =
      transferTaxOrDldFee +
      trusteeFee +
      brokerFee +
      registrationFee +
      mortgageRegFee;

    return {
      transferTaxOrDldFee: Number(transferTaxOrDldFee.toFixed(2)),
      registrationFee: Number((registrationFee + mortgageRegFee).toFixed(2)),
      brokerFee: Number(brokerFee.toFixed(2)),
      trusteeFee: Number(trusteeFee.toFixed(2)),
      totalAcquisitionCosts: Number(totalAcquisitionCosts.toFixed(2)),
    };
  }

  calculateOngoingCosts(
    purchasePrice: number,
    annualRent: number,
    options?: {
      serviceChargePerSqm?: number;
      interiorAreaSqm?: number;
      managementFeePct?: number;
    },
  ) {
    const serviceChargePerSqm = options?.serviceChargePerSqm ?? 25 * 10.7639;
    const interiorAreaSqm = options?.interiorAreaSqm ?? 80; // Default 80sqm
    const managementFeePct = options?.managementFeePct ?? 0.05; // 5% property management fee

    // Dubai has 0% personal property tax
    const propertyTaxAnnual = 0;

    // Service charges (usually charged per sqft or sqm in Dubai)
    const serviceChargeAnnual = serviceChargePerSqm * interiorAreaSqm;

    // Maintenance provision (standard 1% of purchase price per year for repairs)
    const maintenanceAnnual = purchasePrice * 0.01;

    // Management fee
    const managementFeeAnnual = annualRent * managementFeePct;

    const totalOngoingCostsAnnual =
      propertyTaxAnnual +
      serviceChargeAnnual +
      maintenanceAnnual +
      managementFeeAnnual;

    return {
      propertyTaxAnnual,
      serviceChargeAnnual: Number(serviceChargeAnnual.toFixed(2)),
      maintenanceAnnual: Number(maintenanceAnnual.toFixed(2)),
      managementFeeAnnual: Number(managementFeeAnnual.toFixed(2)),
      totalOngoingCostsAnnual: Number(totalOngoingCostsAnnual.toFixed(2)),
    };
  }

  validatePropertyMetadata(metadata: Record<string, any>) {
    const result = UaePropertyMetadataSchema.safeParse(metadata);
    if (!result.success) {
      return {
        success: false,
        errors: result.error.errors.map(
          (err) => `${err.path.join(".")}: ${err.message}`,
        ),
      };
    }
    return {
      success: true,
      data: result.data,
    };
  }
}

/**
 * Spain Country Pack Implementation
 */
export class SpainCountryPack implements CountryPack {
  countryCode = "ES";
  name = "Spain";
  baseCurrency = "EUR";
  timezone = "Europe/Madrid";

  calculateAcquisitionCosts(
    purchasePrice: number,
    options?: {
      isOffPlan?: boolean;
      isMortgage?: boolean;
      brokerFeePct?: number;
    },
  ) {
    const isOffPlan = options?.isOffPlan ?? false;
    const brokerFeePct = options?.brokerFeePct ?? 0.03; // Default 3% agency fee paid by buyer (varies by region)

    // In Spain: Off-plan has VAT (IVA) of 10% + Stamp Duty (AJD) of ~1.5%. Secondary has ITP tax of ~6% - 10%.
    const transferTaxOrDldFee = isOffPlan
      ? purchasePrice * 0.115
      : purchasePrice * 0.08; // Blended average

    // Notary & Land Registry fees (usually ~1% of purchase price)
    const registrationFee = purchasePrice * 0.01;

    // Broker agency fee
    const brokerFee = purchasePrice * brokerFeePct * 1.21; // + 21% VAT

    const trusteeFee = 0; // Not applicable

    const totalAcquisitionCosts =
      transferTaxOrDldFee + registrationFee + brokerFee;

    return {
      transferTaxOrDldFee: Number(transferTaxOrDldFee.toFixed(2)),
      registrationFee: Number(registrationFee.toFixed(2)),
      brokerFee: Number(brokerFee.toFixed(2)),
      trusteeFee,
      totalAcquisitionCosts: Number(totalAcquisitionCosts.toFixed(2)),
    };
  }

  calculateOngoingCosts(
    purchasePrice: number,
    annualRent: number,
    options?: {
      serviceChargePerSqm?: number;
      interiorAreaSqm?: number;
      managementFeePct?: number;
      ibiAnnual?: number;
    },
  ) {
    const managementFeePct = options?.managementFeePct ?? 0.08; // Varies

    // Impuesto sobre Bienes Inmuebles (IBI) Property Tax (roughly 0.4% - 1.1% of cadastral value, assume 0.5% of price)
    const propertyTaxAnnual = options?.ibiAnnual ?? purchasePrice * 0.005;

    // Comunidad fees (serviceChargePerSqm is annual per sqm, so we just multiply by area)
    const serviceChargePerSqm = options?.serviceChargePerSqm ?? 1.5 * 12;
    const interiorAreaSqm = options?.interiorAreaSqm ?? 80;
    const serviceChargeAnnual = serviceChargePerSqm * interiorAreaSqm;

    const maintenanceAnnual = purchasePrice * 0.01;
    const managementFeeAnnual = annualRent * managementFeePct;

    const totalOngoingCostsAnnual =
      propertyTaxAnnual +
      serviceChargeAnnual +
      maintenanceAnnual +
      managementFeeAnnual;

    return {
      propertyTaxAnnual: Number(propertyTaxAnnual.toFixed(2)),
      serviceChargeAnnual: Number(serviceChargeAnnual.toFixed(2)),
      maintenanceAnnual: Number(maintenanceAnnual.toFixed(2)),
      managementFeeAnnual: Number(managementFeeAnnual.toFixed(2)),
      totalOngoingCostsAnnual: Number(totalOngoingCostsAnnual.toFixed(2)),
    };
  }

  validatePropertyMetadata(metadata: Record<string, any>) {
    const result = SpainPropertyMetadataSchema.safeParse(metadata);
    if (!result.success) {
      return {
        success: false,
        errors: result.error.errors.map(
          (err) => `${err.path.join(".")}: ${err.message}`,
        ),
      };
    }
    return {
      success: true,
      data: result.data,
    };
  }
}

/**
 * Global Country Pack Registry
 */
export class CountryPackRegistry {
  private static packs: Map<string, CountryPack> = new Map();

  static register(pack: CountryPack) {
    this.packs.set(pack.countryCode.toUpperCase(), pack);
  }

  static getPack(countryCode: string): CountryPack {
    const pack = this.packs.get(countryCode.toUpperCase());
    if (!pack) {
      throw new Error(
        `Country pack for code "${countryCode}" is not registered.`,
      );
    }
    return pack;
  }

  static listPacks(): CountryPack[] {
    return Array.from(this.packs.values());
  }
}

// Auto-register default packs
CountryPackRegistry.register(new UaeCountryPack());
CountryPackRegistry.register(new SpainCountryPack());
