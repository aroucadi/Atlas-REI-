import { Test, TestingModule } from '@nestjs/testing';
import { DealFinderService } from './deal-finder.service';
import { DatabaseService } from '../database/database.service';

describe('DealFinderService', () => {
  let service: DealFinderService;
  let db: any;

  beforeEach(async () => {
    db = {
      client: {
        investorProfile: {
          findFirst: jest.fn(),
        },
        property: {
          findMany: jest.fn(),
        },
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DealFinderService,
        { provide: DatabaseService, useValue: db },
      ],
    }).compile();

    service = module.get<DealFinderService>(DealFinderService);
  });

  it('should filter out properties that exceed the available capital', async () => {
    db.client.investorProfile.findFirst.mockResolvedValue({
      workspaceId: 'ws-1',
      baseCurrency: 'AED',
      capitalAvailable: 500000,
      riskTolerance: 'moderate',
      incomeVsGrowthPreference: 'balanced',
      financingPreference: 'cash',
      targetCountriesJson: ['AE'],
    });

    db.client.property.findMany.mockResolvedValue([
      {
        id: 'prop-1',
        propertyType: 'completed',
        countryId: 'c-1',
        country: { countryCode: 'AE' },
        building: { name: 'Burj Crown' },
        listings: [
          {
            id: 'list-1',
            priceAmount: 300000,
            priceCurrency: 'AED',
            listingStatus: 'active',
            listingType: 'sale',
          },
        ],
      },
      {
        id: 'prop-2',
        propertyType: 'completed',
        countryId: 'c-1',
        country: { countryCode: 'AE' },
        building: { name: 'Burj Vista' },
        listings: [
          {
            id: 'list-2',
            priceAmount: 600000,
            priceCurrency: 'AED',
            listingStatus: 'active',
            listingType: 'sale',
          },
        ],
      },
    ]);

    const results = await service.searchDeals('ws-1');

    expect(results).toHaveLength(1);
    expect(results[0].property.id).toBe('prop-1');
  });

  it('should rank properties correctly based on matchScore', async () => {
    db.client.investorProfile.findFirst.mockResolvedValue({
      workspaceId: 'ws-1',
      baseCurrency: 'AED',
      capitalAvailable: 2000000,
      riskTolerance: 'conservative',
      incomeVsGrowthPreference: 'balanced',
      financingPreference: 'cash',
      targetCountriesJson: ['AE'],
    });

    db.client.property.findMany.mockResolvedValue([
      {
        id: 'prop-offplan',
        propertyType: 'off-plan',
        countryId: 'c-1',
        country: { countryCode: 'AE' },
        building: { name: 'Off Plan Project' },
        listings: [
          {
            id: 'list-1',
            priceAmount: 1000000,
            priceCurrency: 'AED',
            listingStatus: 'active',
            listingType: 'sale',
          },
        ],
      },
      {
        id: 'prop-completed',
        propertyType: 'completed',
        countryId: 'c-1',
        country: { countryCode: 'AE' },
        building: { name: 'Completed Building' },
        listings: [
          {
            id: 'list-2',
            priceAmount: 1000000,
            priceCurrency: 'AED',
            listingStatus: 'active',
            listingType: 'sale',
          },
        ],
      },
    ]);

    const results = await service.searchDeals('ws-1');

    expect(results).toHaveLength(2);
    expect(results[0].property.id).toBe('prop-completed');
    expect(results[1].property.id).toBe('prop-offplan');
    expect(results[0].matchScore).toBeGreaterThan(results[1].matchScore);
  });
});
