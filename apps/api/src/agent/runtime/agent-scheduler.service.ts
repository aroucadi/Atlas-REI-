import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

@Injectable()
export class AgentSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AgentSchedulerService.name);
  private intervalId?: NodeJS.Timeout;

  constructor(private readonly db: DatabaseService) {}

  onModuleInit() {
    this.logger.log('Starting Agent Runtime Background Scheduler...');
    // Run checks every 30 seconds (or configurable)
    this.intervalId = setInterval(() => {
      this.runSchedulerChecks().catch((err) => {
        this.logger.error('Error running scheduler background checks', err);
      });
    }, 30000);
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  async runSchedulerChecks() {
    this.logger.log('Executing periodic Watchlist and Refinancing checks...');

    // Fetch all active workspaces
    const workspaces = await this.db.client.workspace.findMany();

    for (const workspace of workspaces) {
      // 1. Fetch active investor profile to check scheduler settings
      const profile = await this.db.client.investorProfile.findFirst({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: 'desc' },
      });

      const config = (profile?.constraintsJson as any) || {};
      const watchlistEnabled = config.watchlistCheckEnabled ?? true;
      const refinanceEnabled = config.refinancingCheckEnabled ?? true;

      // 2. Fetch properties in this workspace that are shortlisted or in the portfolio
      const shortlistedItems = await this.db.client.shortlistItem.findMany({
        where: {
          shortlist: {
            workspaceId: workspace.id,
          },
        },
        select: {
          entityId: true,
          entityType: true,
        },
      });
      const shortlistedIds = shortlistedItems
        .filter((item) => item.entityType === 'property')
        .map((item) => item.entityId);

      const portfolioPositions =
        await this.db.client.portfolioPosition.findMany({
          where: {
            portfolio: {
              workspaceId: workspace.id,
            },
          },
          select: {
            propertyId: true,
          },
        });
      const portfolioIds = portfolioPositions
        .map((pos) => pos.propertyId)
        .filter((id): id is string => !!id);

      const targetPropertyIds = Array.from(
        new Set([...shortlistedIds, ...portfolioIds]),
      );

      if (targetPropertyIds.length === 0) {
        continue;
      }

      const properties = await this.db.client.property.findMany({
        where: {
          id: {
            in: targetPropertyIds,
          },
        },
        include: { building: true },
      });

      for (const property of properties) {
        // Watchlist: Diligence Gap check
        if (watchlistEnabled) {
          const evidenceCount = await this.db.client.evidence.count({
            where: {
              workspaceId: workspace.id,
              propertyId: property.id,
              sourceType: 'document',
            },
          });

          if (evidenceCount === 0) {
            // Add a diligence gap warning evidence (market_event type)
            const propertyName =
              property.building?.name ||
              property.externalPropertyRef ||
              'Burj Crown';
            const alertTitle = `Watchlist Alert: Diligence Gap detected on ${propertyName}`;
            const existingAlert = await this.db.client.evidence.findFirst({
              where: {
                workspaceId: workspace.id,
                propertyId: property.id,
                title: alertTitle,
              },
            });

            if (!existingAlert) {
              await this.db.client.evidence.create({
                data: {
                  workspaceId: workspace.id,
                  propertyId: property.id,
                  sourceType: 'market_event',
                  sourceId: property.id,
                  title: alertTitle,
                  snippet: `Critical: No verified lease agreements or due diligence documents have been uploaded for ${propertyName || 'Burj Crown Apartment'}. Watchlist monitoring recommends immediate lease verification.`,
                  confidence: 1.0,
                  freshness: new Date(),
                },
              });
              this.logger.log(
                `Created watchlist diligence gap alert for property ${property.id}`,
              );
            }
          }
        }

        // Refinancing check
        if (refinanceEnabled) {
          const underwrite = await this.db.client.underwriteRun.findFirst({
            where: { workspaceId: workspace.id, propertyId: property.id },
            orderBy: { createdAt: 'desc' },
          });

          if (underwrite) {
            const assumptions = (underwrite.assumptionsJson as any) || {};
            const financing = assumptions.financing || {};
            const interestRate = financing.interestRate ?? 0;

            // Macro baseline rate comparison: if mortgage interest rate is > 5% (e.g. 5.5%), market baselines are at 4.5%
            if (interestRate > 0.05) {
              const propertyName =
                property.building?.name ||
                property.externalPropertyRef ||
                'Burj Crown';
              const alertTitle = `Refinancing Alert: Rate Optimization for ${propertyName}`;
              const existingAlert = await this.db.client.evidence.findFirst({
                where: {
                  workspaceId: workspace.id,
                  propertyId: property.id,
                  title: alertTitle,
                },
              });

              if (!existingAlert) {
                await this.db.client.evidence.create({
                  data: {
                    workspaceId: workspace.id,
                    propertyId: property.id,
                    sourceType: 'market_event',
                    sourceId: property.id,
                    title: alertTitle,
                    snippet: `Refinancing Opportunity: Current mortgage interest rate is ${(interestRate * 100).toFixed(2)}%. Market baseline rates are 4.50%. Refinancing would increase DSCR and net yield.`,
                    confidence: 0.95,
                    freshness: new Date(),
                  },
                });
                this.logger.log(
                  `Created refinancing alert for property ${property.id}`,
                );
              }
            }
          }
        }
      }
    }
  }
}
