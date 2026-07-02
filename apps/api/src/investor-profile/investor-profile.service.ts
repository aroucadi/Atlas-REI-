import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

function mapInvestorProfile(profile: any) {
  if (!profile) return null;
  return {
    id: profile.id,
    workspaceId: profile.workspaceId,
    name: profile.name,
    baseCurrency: profile.baseCurrency,
    capitalAvailable: Number(profile.capitalAvailable),
    riskTolerance: profile.riskTolerance,
    investmentHorizonMonths: profile.investmentHorizonMonths,
    incomeVsGrowthPreference: profile.incomeVsGrowthPreference,
    financingPreference: profile.financingPreference,
    targetCountries: profile.targetCountriesJson,
    constraints: profile.constraintsJson,
    goals: profile.goalsJson,
    createdByUserId: profile.createdByUserId,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

@Injectable()
export class InvestorProfileService {
  constructor(private readonly db: DatabaseService) {}

  async getProfiles(workspaceId: string) {
    const list = await this.db.client.investorProfile.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
    return list.map(mapInvestorProfile);
  }

  async getProfile(workspaceId: string, profileId: string) {
    const profile = await this.db.client.investorProfile.findFirst({
      where: { id: profileId, workspaceId },
    });
    if (!profile) {
      throw new NotFoundException(
        `Investor profile with ID ${profileId} not found in workspace ${workspaceId}`,
      );
    }
    return mapInvestorProfile(profile);
  }

  async createProfile(workspaceId: string, input: any, userId?: string) {
    const profile = await this.db.client.investorProfile.create({
      data: {
        workspaceId,
        name: input.name,
        baseCurrency: input.baseCurrency,
        capitalAvailable: input.capitalAvailable,
        riskTolerance: input.riskTolerance,
        investmentHorizonMonths: input.investmentHorizonMonths,
        incomeVsGrowthPreference: input.incomeVsGrowthPreference,
        financingPreference: input.financingPreference,
        targetCountriesJson: input.targetCountries,
        constraintsJson: input.constraints || {},
        goalsJson: input.goals || {},
        createdByUserId: userId,
      },
    });
    return mapInvestorProfile(profile);
  }

  async updateProfile(workspaceId: string, profileId: string, input: any) {
    const existing = await this.db.client.investorProfile.findFirst({
      where: { id: profileId, workspaceId },
    });
    if (!existing) {
      throw new NotFoundException(
        `Investor profile with ID ${profileId} not found in workspace ${workspaceId}`,
      );
    }

    const profile = await this.db.client.investorProfile.update({
      where: { id: profileId },
      data: {
        name: input.name,
        baseCurrency: input.baseCurrency,
        capitalAvailable: input.capitalAvailable,
        riskTolerance: input.riskTolerance,
        investmentHorizonMonths: input.investmentHorizonMonths,
        incomeVsGrowthPreference: input.incomeVsGrowthPreference,
        financingPreference: input.financingPreference,
        targetCountriesJson: input.targetCountries,
        constraintsJson: input.constraints || {},
        goalsJson: input.goals || {},
      },
    });
    return mapInvestorProfile(profile);
  }
}
