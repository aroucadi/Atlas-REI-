import { Test } from '@nestjs/testing';
import { DatabaseService } from '../../apps/api/src/database/database.service';

describe('RagasGroundingEvaluationHarness', () => {
  const mockDbService = {
    client: {
      promptConfig: {
        findFirst: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    await Test.createTestingModule({
      providers: [
        {
          provide: DatabaseService,
          useValue: mockDbService,
        },
      ],
    }).compile();
  });

  function calculateGroundingScore(answer: string, context: string): number {
    const contextWords = new Set(
      context
          .toLowerCase()
          .split(/\s+/)
          .map((w) => w.replace(/[^\w]/g, '')),
    );
    const answerWords = answer
        .toLowerCase()
        .split(/\s+/)
        .map((w) => w.replace(/[^\w]/g, ''))
        .filter(Boolean);

    if (answerWords.length === 0) return 1.0;

    let groundedCount = 0;
    for (const word of answerWords) {
      // Exclude simple stopwords
      if (
          [
            'the',
            'a',
            'an',
            'is',
            'are',
            'and',
            'or',
            'in',
            'on',
            'at',
            'to',
            'of',
            'for',
            'with',
            'by',
          ].includes(word)
      ) {
        groundedCount++;
        continue;
      }
      if (contextWords.has(word)) {
        groundedCount++;
      }
    }

    return groundedCount / answerWords.length;
  }

  it('should pass quality gate if grounding score is 90% or above', () => {
    const context = `Lease Agreement: annual rent amount is AED 120,000. Tenant name is John Doe. Lease start date is 2026-01-01. Escalation: rent increases by 5% annually. Governing law is Dubai UAE.`;

    // 95%+ grounded words matching context
    const goodAnswer = `The tenant is John Doe and the annual rent is AED 120,000 start 2026-01-01 governing law Dubai.`;

    const score = calculateGroundingScore(goodAnswer, context);
    expect(score).toBeGreaterThanOrEqual(0.9);
  });

  it('should fail quality gate if grounding score drops below 90% (simulating hallucination)', () => {
    const context = `Lease Agreement: annual rent amount is AED 120,000. Tenant name is John Doe. Lease start date is 2026-01-01. Escalation: rent increases by 5% annually. Governing law is Dubai UAE.`;

    // Infuses hallucinated terms: "monthly rent", "payment default fee is 500 USD", "tenant John Smith"
    const hallucinatedAnswer = `The monthly rent is 10,000 AED and the tenant John Smith has to pay a default fee of 500 USD under Spanish law.`;

    const score = calculateGroundingScore(hallucinatedAnswer, context);

    // Verify it fails the 90% gate
    expect(score).toBeLessThan(0.9);
  });
});
