if (process.env.NODE_ENV !== 'test') {
  throw new Error(
    'CRITICAL SECURITY FAILURE: NODE_ENV must be set to "test" for E2E tests.',
  );
}
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    'CRITICAL SECURITY FAILURE: TEST_DATABASE_URL environment variable is missing.',
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
if (!process.env.DATABASE_URL.toLowerCase().includes('test')) {
  throw new Error(
    `CRITICAL SECURITY FAILURE: DATABASE_URL "${process.env.DATABASE_URL}" does not contain the word "test".`,
  );
}
if (!process.env.JWT_SECRET) {
  throw new Error(
    'CRITICAL SECURITY FAILURE: JWT_SECRET environment variable is missing.',
  );
}

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { DatabaseService } from './../src/database/database.service';

describe('Security and Tenancy boundaries (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['/'] });
    await app.init();

    const db = moduleFixture.get(DatabaseService);

    // Clear properties and dependent entities for deterministic tests
    await db.client.listing.deleteMany({}).catch(() => {});
    await db.client.portfolioPosition.deleteMany({}).catch(() => {});
    await db.client.investmentDecision.deleteMany({}).catch(() => {});
    await db.client.property.deleteMany({}).catch(() => {});

    const testEmails = ['user1@example.com', 'user2@example.com'];
    const users = await db.client.user.findMany({
      where: { email: { in: testEmails } },
      include: { memberships: true },
    });
    for (const user of users) {
      for (const membership of user.memberships) {
        await db.client.organization
          .delete({
            where: { id: membership.organizationId },
          })
          .catch(() => {});
      }
      await db.client.user.delete({ where: { id: user.id } }).catch(() => {});
    }

    // Seed countries, cities, districts, buildings, properties for test isolation
    const countryAE = await db.client.country.upsert({
      where: { countryCode: 'AE' },
      update: {},
      create: {
        countryCode: 'AE',
        name: 'United Arab Emirates',
        currencyCode: 'AED',
      },
    });

    await db.client.country.upsert({
      where: { countryCode: 'ES' },
      update: {},
      create: {
        countryCode: 'ES',
        name: 'Spain',
        currencyCode: 'EUR',
      },
    });

    const cityDXB = await db.client.city.upsert({
      where: {
        countryId_cityCode: { countryId: countryAE.id, cityCode: 'DXB' },
      },
      update: {},
      create: {
        countryId: countryAE.id,
        cityCode: 'DXB',
        name: 'Dubai',
        timezone: 'Asia/Dubai',
      },
    });

    const districtDowntown = await db.client.district.upsert({
      where: {
        cityId_districtCode: { cityId: cityDXB.id, districtCode: 'DOWNTOWN' },
      },
      update: {},
      create: {
        cityId: cityDXB.id,
        districtCode: 'DOWNTOWN',
        name: 'Downtown Dubai',
      },
    });

    const buildingBurjCrown = await db.client.building.upsert({
      where: { id: '00000000-0000-0000-0000-000000000001' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000001',
        districtId: districtDowntown.id,
        cityId: cityDXB.id,
        name: 'Burj Crown',
        normalizedName: 'BURJ CROWN',
      },
    });

    await db.client.property.upsert({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      update: {},
      create: {
        id: '00000000-0000-0000-0000-000000000002',
        buildingId: buildingBurjCrown.id,
        cityId: cityDXB.id,
        districtId: districtDowntown.id,
        countryId: countryAE.id,
        propertyType: 'apartment',
        interiorAreaSqm: 80,
      },
    });
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  let user1Token: string;
  let user1WorkspaceId: string;
  let user1PropertyId: string;
  let user1ProfileId: string;

  let user2Token: string;

  it('should register user 1 and seed default entities', async () => {
    const registerPayload = {
      email: 'user1@example.com',
      fullName: 'User One',
      passwordString: 'Password123',
    };

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerPayload)
      .expect(201);

    expect(res.body).toHaveProperty('userId');
    expect(res.body).toHaveProperty('workspaceId');
    expect(res.body).toHaveProperty('propertyId');

    user1WorkspaceId = res.body.workspaceId;
    user1PropertyId = '00000000-0000-0000-0000-000000000002';

    // Login to get token
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registerPayload.email,
        passwordString: registerPayload.passwordString,
      })
      .expect(200);

    expect(loginRes.body).toHaveProperty('accessToken');
    user1Token = loginRes.body.accessToken;
  });

  it('should register user 2 and login', async () => {
    const registerPayload = {
      email: 'user2@example.com',
      fullName: 'User Two',
      passwordString: 'Password456',
    };

    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(registerPayload)
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({
        email: registerPayload.email,
        passwordString: registerPayload.passwordString,
      })
      .expect(200);

    user2Token = loginRes.body.accessToken;
  });

  it('should access /me endpoint with user 1 token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(res.body.data.email).toBe('user1@example.com');
    expect(res.body.data.defaultPropertyId).toBeNull();
    expect(res.body.data).not.toHaveProperty('passwordHash');
  });

  it('should get workspaces profiles for user 1', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/profiles`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    expect(res.body.length).toBeGreaterThan(0);
    user1ProfileId = res.body[0].id;
  });

  it('should block user 2 from accessing user 1 workspace profiles (tenancy boundary)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/profiles`)
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(403);
  });

  it('should evaluate a deal successfully for user 1', async () => {
    // 1. Create an underwriting run
    const underwriteRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/underwrite`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        propertyId: user1PropertyId,
        countryCode: 'AE',
        currency: 'AED',
        purchasePrice: 1500000,
        grossRentalIncomeAnnual: 150000,
        serviceChargeValue: 25,
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
        financing: {
          downPaymentPct: 0.25,
          interestRate: 0.05,
          termMonths: 300,
        },
      })
      .expect(201);

    const underwriteRunId = underwriteRes.body.id;
    expect(underwriteRunId).toBeDefined();

    // 2. Evaluate using the underwrite run ID
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/committee/evaluate`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        investorProfileId: user1ProfileId,
        underwriteRunId,
      })
      .expect(201);

    expect(res.body).toHaveProperty('verdict');
    expect(res.body.verdict).toBe('Buy');
    expect(res.body.policyVerdict).toBe('Buy');
    expect(res.body.aiVerdict).toBe('Buy');
    expect(res.body.overrideReason).toBeNull();
    expect(res.body.entityId).toBe(user1PropertyId);
    expect(res.body.underwriteRunId).toBe(underwriteRunId);
    expect(res.body.decisionSource).toBe('mock');
  });

  it('should trigger a deterministic policy override (Avoid) if capital is insufficient', async () => {
    // 1. Create a profile with very low capital available (e.g. 100 AED)
    const lowCapitalProfileRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/profiles`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        name: 'Low Capital Mandate',
        baseCurrency: 'AED',
        capitalAvailable: 100,
        riskTolerance: 'moderate',
        investmentHorizonMonths: 36,
        incomeVsGrowthPreference: 'income',
        financingPreference: 'cash',
        targetCountries: ['AE'],
      })
      .expect(201);

    const lowCapitalProfileId = lowCapitalProfileRes.body.id;

    // 2. Create underwriting for a 1.5m AED property
    const underwriteRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/underwrite`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        propertyId: user1PropertyId,
        countryCode: 'AE',
        currency: 'AED',
        purchasePrice: 1500000,
        grossRentalIncomeAnnual: 120000,
        serviceChargeValue: 25,
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
      })
      .expect(201);

    const underwriteRunId = underwriteRes.body.id;

    // 3. Evaluate: AI returns 'Buy' or 'Strong Buy' but policy overrides to 'Avoid'
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/committee/evaluate`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        investorProfileId: lowCapitalProfileId,
        underwriteRunId,
      })
      .expect(201);

    expect(res.body.policyVerdict).toBe('Avoid');
    expect(res.body.verdict).toBe('Avoid');
    expect(res.body.overrideReason).toContain('Capital insufficiency');
  });

  it('should reject committee evaluation in production if running in simulation mode', async () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const underwriteRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/underwrite`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          workspaceId: user1WorkspaceId,
          propertyId: user1PropertyId,
          countryCode: 'AE',
          currency: 'AED',
          purchasePrice: 1500000,
          grossRentalIncomeAnnual: 150000,
          serviceChargeValue: 25,
          serviceChargeUnit: 'per_sqft_annual',
          interiorAreaSqm: 80,
          financing: {
            downPaymentPct: 0.25,
            interestRate: 0.05,
            termMonths: 300,
          },
        })
        .expect(201);

      const underwriteRunId = underwriteRes.body.id;

      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/committee/evaluate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          workspaceId: user1WorkspaceId,
          investorProfileId: user1ProfileId,
          underwriteRunId,
        })
        .expect(400);
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  it('should block user 2 from running committee evaluation on user 1 workspace (tenancy boundary)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/committee/evaluate`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        investorProfileId: user1ProfileId,
        underwriteRunId: '00000000-0000-0000-0000-000000000000',
      })
      .expect(403);
  });

  it('should block user 2 from running underwriting on user 1 workspace (tenancy boundary)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/underwrite`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        propertyId: user1PropertyId,
        countryCode: 'AE',
        currency: 'AED',
        purchasePrice: 1500000,
        grossRentalIncomeAnnual: 120000,
        serviceChargeValue: 25,
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
      })
      .expect(403);
  });

  it('should perform underwrite and handle currency conversion and service charge conversion', async () => {
    // Underwriting UAE property with USD currency (expects AED base pack conversion)
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/underwrite`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        propertyId: user1PropertyId,
        countryCode: 'AE',
        currency: 'USD',
        purchasePrice: 300000, // 300k USD -> ~1.1m AED
        grossRentalIncomeAnnual: 24000,
        serviceChargeValue: 25, // 25 AED/sqft
        serviceChargeUnit: 'per_sqft_annual',
        interiorAreaSqm: 80,
      })
      .expect(201);

    expect(res.body.currency).toBe('AED');
    // 300,000 USD * 3.6725 = 1,101,750 AED
    expect(res.body.purchasePrice).toBeCloseTo(1101750, 1);
    // Ongoing service charge: 25 AED/sqft * 10.7639 * 80 sqm = ~21,527.8 AED
    expect(res.body.ongoingCosts.serviceChargeAnnual).toBeCloseTo(21527.8, 1);
    expect(res.body.metrics.dscr).toBeNull(); // No financing, DSCR should be null
  });

  it('should reject underwriting if the property country code does not match the input country code', async () => {
    // Underwriting UAE property (user1PropertyId is AE) with ES country code
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/underwrite`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        workspaceId: user1WorkspaceId,
        propertyId: user1PropertyId,
        countryCode: 'ES',
        currency: 'EUR',
        purchasePrice: 500000,
        grossRentalIncomeAnnual: 40000,
        serviceChargeValue: 1.5,
        serviceChargeUnit: 'per_sqm_monthly',
        interiorAreaSqm: 80,
      })
      .expect(400);
  });

  it('should allow document upload with 201 Created and process it asynchronously to complete and register evidence', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/documents/upload`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        fileName: 'lease_contract.pdf',
        entityType: 'property',
        entityId: user1PropertyId,
        documentType: 'lease_agreement',
        fileBase64:
          'JVBERi0xLjQKMSAwIG9iago8PAogIC9UeXBlIC9DYXRhbG9nCiAgL1BhZ2VzIDIgMCBSCj4+CmVuZG9iCjIgMCBvYmoKPDwKICAvVHlwZSAvUGFnZXMKICAvS2lkcyBbMyAwIFJdCiAgL0NvdW50IDEKPj4KZW5kb2IKMyAwIG9iago8PAogIC9UeXBlIC9QYWdlCiAgL1BhcmVudCAyIDAgUgogIC9NZWRpYUJveCBbMCAwIDU5NSA4NDJdCiAgL1Jlc291cmNlcyA8PAogICAgL0ZvbnQgPDwKICAgICAgL0YxIDQgMCBSCiAgICA+PgogID4+CiAgL0NvbnRlbnRzIDUgMCBSCj4+CmVuZG9iCjQgMCBvYmoKPDwKICAvVHlwZSAvRm9udAogIC9TdWJ0eXBlIC9UeXBlMQogIC9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iCjUgMCBvYmoKPDwKICAvTGVuZ3RoIDQ0Cj4+CnN0cmVhbQpCVAovRjEgMTIgVGYKNzAgNzAwIFRkCihMZWFzZSBBZ3JlZW1lbnQ6IGFubnVhbCByZW50IGFtb3VudCBpcyBBRUQgMTIwLDAwMC4pIFRqCkVUCmVuZHN0cmVhbQplbmRvYgp4cmVmCjAgNgowMDAwMDAwMDAwIDY1NTM1IGYgCjAwMDAwMDAwMDkgMDAwMDAgbiAKMDAwMDAwMDA2OCAwMDAwMCBuIAowMDAwMDAwMTI3IDAwMDAwIG4gCjAwMDAwMDAyNjEgMDAwMDAgbiAKMDAwMDAwMDMyNCAwMDAwMCBuIAp0cmFpbGVyCjw8CiAgL1NpemUgNgogIC9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgowMDAwMDAwNDIwCiUlRU9GCg==',
      })
      .expect(201);

    expect(res.body.status).toBeDefined();

    // Poll the documents endpoint until status is 'completed'
    let documentStatus = res.body.status;
    let attempts = 0;
    const documentId = res.body.id;
    while (documentStatus !== 'completed' && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/documents`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      const uploadedDoc = getRes.body.find((d: any) => d.id === documentId);
      if (uploadedDoc) {
        documentStatus = uploadedDoc.status;
      }
      attempts++;
    }

    expect(documentStatus).toBe('completed');

    // Verify corresponding Evidence record was registered
    const evidenceRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/evidence`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    const docEvidence = evidenceRes.body.find(
      (e: any) => e.sourceId === documentId,
    );
    expect(docEvidence).toBeDefined();
    expect(docEvidence.sourceType).toBe('document');
    expect(docEvidence.title).toContain('lease_contract.pdf');
  });

  it('should prevent user2 from creating or retrieving investor profiles in user1 workspace', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/profiles`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        name: 'Mandate',
        baseCurrency: 'AED',
        capitalAvailable: 1000000,
        riskTolerance: 'moderate',
        investmentHorizonMonths: 60,
        incomeVsGrowthPreference: 'balanced',
        financingPreference: 'flexible',
        targetCountries: ['AE'],
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/profiles`)
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(403);
  });

  it('should prevent user2 from running deal search in user1 workspace', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/deal-finder/search`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({})
      .expect(403);
  });

  it('should prevent user2 from managing shortlists in user1 workspace', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/shortlists`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        name: 'List',
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/shortlists`)
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(403);
  });

  it('should allow user1 to successfully manage profiles, run deal finder, and manage shortlists', async () => {
    const profileRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/profiles`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        name: 'Mandate AE',
        baseCurrency: 'AED',
        capitalAvailable: 2000000,
        riskTolerance: 'moderate',
        investmentHorizonMonths: 36,
        incomeVsGrowthPreference: 'income',
        financingPreference: 'cash',
        targetCountries: ['AE'],
      })
      .expect(201);

    const profileId = profileRes.body.id;

    const searchRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/deal-finder/search`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({ investorProfileId: profileId })
      .expect(201);

    expect(Array.isArray(searchRes.body)).toBe(true);

    const shortlistRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/shortlists`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        name: 'AE Target Deals',
        investorProfileId: profileId,
      })
      .expect(201);

    const shortlistId = shortlistRes.body.id;

    const itemRes = await request(app.getHttpServer())
      .post(
        `/api/v1/workspaces/${user1WorkspaceId}/shortlists/${shortlistId}/items`,
      )
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        entityType: 'property',
        entityId: user1PropertyId,
      })
      .expect(201);

    const itemId = itemRes.body.id;

    await request(app.getHttpServer())
      .delete(
        `/api/v1/workspaces/${user1WorkspaceId}/shortlists/${shortlistId}/items/${itemId}`,
      )
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);
  });

  it('should allow user1 to chat with the copilot and execute tools', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/copilot/chat`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        message: 'Summarize this deal for Burj Crown',
        propertyId: user1PropertyId,
      })
      .expect(201);

    expect(res.body).toHaveProperty('answer');
    expect(res.body).toHaveProperty('toolsUsed');
    expect(res.body).toHaveProperty('suggestedActions');
    expect(res.body.toolsUsed.length).toBeGreaterThan(0);
    expect(res.body.toolsUsed[0].name).toBe('summarize_deal');
  });

  it('should prevent user2 from chatting with copilot in user1 workspace (tenancy boundary)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/copilot/chat`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        message: 'Summarize this deal for Burj Crown',
        propertyId: user1PropertyId,
      })
      .expect(403);
  });

  it('should reject copilot chat with bad request on validation failure', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/copilot/chat`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        message: '',
      })
      .expect(400);
  });

  it('should run memo agent draft generation, approve it, and finalize document', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/agents/memo/generate`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        propertyId: user1PropertyId,
      })
      .expect(201);

    expect(res.body.status).toBe('queued');
    const jobId = res.body.id;

    let jobStatus = res.body.status;
    let attempts = 0;
    while (jobStatus !== 'awaiting_approval' && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      jobStatus = getRes.body.status;
      attempts++;
    }
    expect(jobStatus).toBe('awaiting_approval');

    const approveRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}/approve`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(201);

    expect(approveRes.body.status).toBe('completed');
    expect(approveRes.body.resultRefJson).toHaveProperty('documentId');

    const docsRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/documents`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    const memoDoc = docsRes.body.find(
      (d: any) => d.id === approveRes.body.resultRefJson.documentId,
    );
    expect(memoDoc).toBeDefined();
    expect(memoDoc.documentType).toBe('investment_memo');
  });

  it('should prevent user2 from triggering or managing jobs in user1 workspace (tenancy boundary)', async () => {
    await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/agents/memo/generate`)
      .set('Authorization', `Bearer ${user2Token}`)
      .send({
        propertyId: user1PropertyId,
      })
      .expect(403);

    await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/jobs`)
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(403);
  });

  it('should run multi-agent workflow job lifecycle, approve screening, run diligence/memo, and approve final memo', async () => {
    // 1. Trigger workflow
    const res = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/agents/workflow/trigger`)
      .set('Authorization', `Bearer ${user1Token}`)
      .send({
        propertyId: user1PropertyId,
        investorProfileId: user1ProfileId,
      })
      .expect(201);

    expect(res.body.status).toBe('queued');
    expect(res.body.jobType).toBe('multi_agent_workflow');
    const jobId = res.body.id;

    // 2. Poll for screening (Gate A)
    let jobStatus = res.body.status;
    let step = '';
    let attempts = 0;
    while (jobStatus !== 'awaiting_approval' && attempts < 10) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      jobStatus = getRes.body.status;
      step = getRes.body.resultRefJson?.step;
      attempts++;
    }
    expect(jobStatus).toBe('awaiting_approval');
    expect(step).toBe('screening');

    // 3. User 2 tenancy boundary check: try to approve screening, should be 403
    await request(app.getHttpServer())
      .post(
        `/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}/approve-screening`,
      )
      .set('Authorization', `Bearer ${user2Token}`)
      .expect(403);

    // 4. Approve screening (Gate A)
    const approveScreeningRes = await request(app.getHttpServer())
      .post(
        `/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}/approve-screening`,
      )
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(201);

    expect(approveScreeningRes.body.status).toBe('running');
    expect(approveScreeningRes.body.resultRefJson.step).toBe('diligence');

    // 5. Poll for memo (Gate B)
    jobStatus = approveScreeningRes.body.status;
    attempts = 0;
    while (jobStatus !== 'awaiting_approval' && attempts < 15) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const getRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      jobStatus = getRes.body.status;
      step = getRes.body.resultRefJson?.step;
      attempts++;
    }
    expect(jobStatus).toBe('awaiting_approval');
    expect(step).toBe('memo');

    // 6. Approve memo (Gate B)
    const approveMemoRes = await request(app.getHttpServer())
      .post(`/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}/approve-memo`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(201);

    expect(approveMemoRes.body.status).toBe('completed');

    // 7. Verify documents exist
    const docsRes = await request(app.getHttpServer())
      .get(`/api/v1/workspaces/${user1WorkspaceId}/documents`)
      .set('Authorization', `Bearer ${user1Token}`)
      .expect(200);

    const screeningDoc = docsRes.body.find(
      (d: any) =>
        d.id === approveScreeningRes.body.resultRefJson.screeningReportId,
    );
    expect(screeningDoc).toBeDefined();
    expect(screeningDoc.documentType).toBe('screening_report');

    const memoDoc = docsRes.body.find(
      (d: any) => d.id === approveMemoRes.body.resultRefJson.documentId,
    );
    expect(memoDoc).toBeDefined();
    expect(memoDoc.documentType).toBe('investment_memo');
  });

  describe('Release 7: Operational Agent Platform Endpoints', () => {
    it('should expose agent definitions and tools registries', async () => {
      const defsRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/agents/definitions`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      expect(Array.isArray(defsRes.body)).toBe(true);
      expect(defsRes.body.length).toBeGreaterThan(0);
      expect(defsRes.body[0]).toHaveProperty('id');

      const toolsRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/agents/tools`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      expect(Array.isArray(toolsRes.body)).toBe(true);
      expect(toolsRes.body.length).toBeGreaterThan(0);
      expect(toolsRes.body[0]).toHaveProperty('name');
    });

    it('should get agent analytics and verify tenancy boundaries', async () => {
      const analyticsRes = await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/agents/analytics`)
        .set('Authorization', `Bearer ${user1Token}`)
        .expect(200);
      expect(analyticsRes.body).toHaveProperty('totalRuns');
      expect(analyticsRes.body).toHaveProperty('completionRate');

      // Tenancy check: User 2 cannot read User 1 analytics
      await request(app.getHttpServer())
        .get(`/api/v1/workspaces/${user1WorkspaceId}/agents/analytics`)
        .set('Authorization', `Bearer ${user2Token}`)
        .expect(403);
    });

    it('should enforce database-level WORM audit policies on audit_logs table', async () => {
      const db = app.get(DatabaseService);

      // Create a test audit log entry
      const logEntry = await db.client.auditLog.create({
        data: {
          entityType: 'test_entity',
          entityId: 'test-id-123',
          action: 'CREATE',
        },
      });

      const logId = logEntry.id;

      // Try updating via raw SQL. The WORM rule should intercept and ignore the update.
      await db.client.$executeRawUnsafe(
        `UPDATE "audit_logs" SET "action" = 'UPDATED_ACTION' WHERE "id" = '${logId}';`,
      );

      const afterUpdate = await db.client.auditLog.findUnique({
        where: { id: logId },
      });
      expect(afterUpdate?.action).toBe('CREATE'); // Action should remain unchanged

      // Try deleting via raw SQL. The WORM rule should intercept and ignore the delete.
      await db.client.$executeRawUnsafe(
        `DELETE FROM "audit_logs" WHERE "id" = '${logId}';`,
      );

      const afterDelete = await db.client.auditLog.findUnique({
        where: { id: logId },
      });
      expect(afterDelete).not.toBeNull(); // Record should still exist
    });

    it('should toggle policies and support auto-approval gating bypass', async () => {
      // Toggle requireMemoApproval to false
      const toggleRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/agents/policy/toggle`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          requireMemoApproval: false,
          requireScreeningApproval: false,
        })
        .expect(201);

      expect(toggleRes.body.success).toBe(true);

      // Trigger a single memo job
      const runRes = await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/agents/memo/generate`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          propertyId: user1PropertyId,
        })
        .expect(201);

      const jobId = runRes.body.id;

      // Poll for job completion directly (it should bypass awaiting_approval and go straight to completed!)
      let jobStatus = runRes.body.status;
      let attempts = 0;
      while (
        jobStatus !== 'completed' &&
        jobStatus !== 'failed' &&
        attempts < 10
      ) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const getRes = await request(app.getHttpServer())
          .get(`/api/v1/workspaces/${user1WorkspaceId}/jobs/${jobId}`)
          .set('Authorization', `Bearer ${user1Token}`)
          .expect(200);
        jobStatus = getRes.body.status;
        attempts++;
      }
      expect(jobStatus).toBe('completed');

      // Reset policy back to true to not disrupt other tests
      await request(app.getHttpServer())
        .post(`/api/v1/workspaces/${user1WorkspaceId}/agents/policy/toggle`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          requireMemoApproval: true,
          requireScreeningApproval: true,
        })
        .expect(201);
    });
  });
});
