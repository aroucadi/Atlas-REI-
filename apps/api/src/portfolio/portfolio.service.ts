import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

function mapPosition(pos: any) {
  if (!pos) return null;
  return {
    ...pos,
    acquisitionPrice: Number(pos.acquisitionPrice),
    ownershipSharePct: Number(pos.ownershipSharePct),
    financingFacilities: pos.financingFacilities?.map((f: any) => ({
      ...f,
      principalAmount: Number(f.principalAmount),
      interestRateValue: Number(f.interestRateValue),
      ltvAtOrigination:
        f.ltvAtOrigination !== null ? Number(f.ltvAtOrigination) : null,
    })),
    cashFlowEntries: pos.cashFlowEntries?.map((c: any) => ({
      ...c,
      amount: Number(c.amount),
    })),
  };
}

function mapPortfolio(port: any) {
  if (!port) return null;
  return {
    ...port,
    positions: port.positions?.map(mapPosition),
  };
}

@Injectable()
export class PortfolioService {
  constructor(private readonly db: DatabaseService) {}

  async getPortfolios(workspaceId: string) {
    const list = await this.db.client.portfolio.findMany({
      where: { workspaceId },
      include: {
        positions: {
          include: {
            property: {
              include: {
                building: true,
                city: true,
              },
            },
            financingFacilities: true,
            cashFlowEntries: true,
          },
        },
      },
    });
    return list.map(mapPortfolio);
  }

  async getPositions(workspaceId: string, portfolioId: string) {
    const portfolio = await this.db.client.portfolio.findFirst({
      where: { id: portfolioId, workspaceId },
    });
    if (!portfolio) {
      throw new NotFoundException('Portfolio not found in this workspace');
    }

    const positions = await this.db.client.portfolioPosition.findMany({
      where: { portfolioId },
      include: {
        property: {
          include: {
            building: true,
            city: true,
          },
        },
        financingFacilities: true,
        cashFlowEntries: true,
      },
    });
    return positions.map(mapPosition);
  }

  async addPosition(workspaceId: string, portfolioId: string, data: any) {
    const portfolio = await this.db.client.portfolio.findFirst({
      where: { id: portfolioId, workspaceId },
    });
    if (!portfolio) {
      throw new NotFoundException('Portfolio not found in this workspace');
    }

    const position = await this.db.client.portfolioPosition.create({
      data: {
        portfolioId,
        propertyId: data.propertyId || null,
        acquisitionDate: new Date(data.acquisitionDate),
        acquisitionPrice: data.acquisitionPrice,
        acquisitionCurrency: data.acquisitionCurrency,
        ownershipSharePct: data.ownershipSharePct ?? 100.0,
        status: data.status || 'active',
        notes: data.notes || '',
        financingFacilities: data.financing
          ? {
              create: {
                lenderName: data.financing.lenderName,
                loanType: data.financing.loanType,
                principalAmount: data.financing.principalAmount,
                currency: data.financing.currency,
                interestRateType: data.financing.interestRateType,
                interestRateValue: data.financing.interestRateValue,
                termMonths: data.financing.termMonths,
              },
            }
          : undefined,
      },
      include: {
        property: true,
        financingFacilities: true,
      },
    });
    return mapPosition(position);
  }

  async createPortfolio(workspaceId: string, data: any) {
    const portfolio = await this.db.client.portfolio.create({
      data: {
        workspaceId,
        name: data.name,
        baseCurrency: data.baseCurrency || 'AED',
        portfolioType: data.portfolioType || 'personal',
      },
    });
    return portfolio;
  }
}
