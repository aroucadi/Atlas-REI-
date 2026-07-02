import { Injectable, OnModuleInit } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

const STATIC_EXCHANGE_RATES: Record<string, Record<string, number>> = {
  USD: { AED: 3.6725, EUR: 0.92, USD: 1 },
  AED: { USD: 1 / 3.6725, EUR: 0.92 / 3.6725, AED: 1 },
  EUR: { USD: 1 / 0.92, AED: 3.6725 / 0.92, EUR: 1 },
};

@Injectable()
export class ForexService implements OnModuleInit {
  constructor(private readonly db: DatabaseService) {}

  async onModuleInit() {
    // Initial sync
    void this.syncRates().catch((err) =>
      console.warn('Initial Forex sync failed, using cache', err),
    );
  }

  async syncRates() {
    try {
      // Fetch latest USD rates from a free API
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }
      const data = await response.json();
      if (data && data.rates) {
        const usdToDxb = data.rates.AED || 3.6725;
        const usdToEur = data.rates.EUR || 0.92;

        const pairs = [
          { from: 'USD', to: 'AED', rate: usdToDxb },
          { from: 'USD', to: 'EUR', rate: usdToEur },
          { from: 'AED', to: 'USD', rate: 1 / usdToDxb },
          { from: 'AED', to: 'EUR', rate: usdToEur / usdToDxb },
          { from: 'EUR', to: 'USD', rate: 1 / usdToEur },
          { from: 'EUR', to: 'AED', rate: usdToDxb / usdToEur },
          { from: 'USD', to: 'USD', rate: 1 },
          { from: 'AED', to: 'AED', rate: 1 },
          { from: 'EUR', to: 'EUR', rate: 1 },
        ];

        for (const pair of pairs) {
          await this.db.client.forexRate.upsert({
            where: {
              from_to: {
                from: pair.from,
                to: pair.to,
              },
            },
            update: {
              rate: pair.rate,
              updatedAt: new Date(),
            },
            create: {
              from: pair.from,
              to: pair.to,
              rate: pair.rate,
            },
          });
        }
        console.log('[ForexService] Exchange rates synchronized successfully.');
      }
    } catch (error: any) {
      console.warn(
        '[ForexService] Failed to fetch live exchange rates. Falling back to cache/static.',
        error.message,
      );
    }
  }

  async convert(amount: number, from: string, to: string): Promise<number> {
    const fromKey = from.toUpperCase();
    const toKey = to.toUpperCase();
    if (fromKey === toKey) return amount;

    try {
      const cached = await this.db.client.forexRate.findUnique({
        where: {
          from_to: {
            from: fromKey,
            to: toKey,
          },
        },
      });
      if (cached) {
        return amount * Number(cached.rate);
      }
    } catch (dbErr: any) {
      console.warn(
        '[ForexService] Database error checking exchange rates, using static fallback.',
        dbErr.message,
      );
    }

    // Static fallback
    const rates = STATIC_EXCHANGE_RATES[fromKey];
    const rate = rates ? rates[toKey] : undefined;
    if (!rate) {
      throw new Error(`Unsupported currency conversion from ${from} to ${to}`);
    }
    return amount * rate;
  }
}
