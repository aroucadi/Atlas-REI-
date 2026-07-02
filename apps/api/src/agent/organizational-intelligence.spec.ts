import { InstitutionalOutcomeAnalyzerService } from './institutional-outcome-analyzer.service';
import { CrossGoalPatternExtractorService } from './cross-goal-pattern-extractor.service';
import { SecureAnonymizerService } from './secure-anonymizer.service';
import { BadRequestException } from '@nestjs/common';

describe('Organizational Intelligence Layer (Release 19)', () => {
  let outcomeService: InstitutionalOutcomeAnalyzerService;
  let extractorService: CrossGoalPatternExtractorService;
  let anonymizerService: SecureAnonymizerService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        underwriteRun: {
          findFirst: jest.fn(),
        },
        saleTransaction: {
          findFirst: jest.fn(),
        },
        rentalTransaction: {
          findFirst: jest.fn(),
        },
        agentTask: {
          findMany: jest.fn(),
        },
      },
    };

    outcomeService = new InstitutionalOutcomeAnalyzerService(mockDb);
    extractorService = new CrossGoalPatternExtractorService(mockDb);
    anonymizerService = new SecureAnonymizerService();
  });

  describe('InstitutionalOutcomeAnalyzerService', () => {
    it('should calculate yield drift and forecast errors correctly', async () => {
      mockDb.client.underwriteRun.findFirst.mockResolvedValue({
        metricsJson: { estimatedYield: 0.08 },
      });
      mockDb.client.saleTransaction.findFirst.mockResolvedValue({
        priceAmount: 1000000, // 1M purchase price
      });
      mockDb.client.rentalTransaction.findFirst.mockResolvedValue({
        annualRentAmount: 90000, // 90k rent = 9% yield
      });

      const analysis = await outcomeService.analyzeDrifts('ws-123', 'prop-123');

      expect(analysis.estimatedYield).toBe(0.08);
      expect(analysis.actualYield).toBe(0.09);
      expect(analysis.yieldDrift).toBe(0.01); // 9% - 8% = 1%
      expect(analysis.forecastingError).toBe(-0.1111); // (8% - 9%) / 9% = -1/9 = -0.1111
    });

    it('should throw BadRequestException if no underwriting found', async () => {
      mockDb.client.underwriteRun.findFirst.mockResolvedValue(null);
      await expect(
        outcomeService.analyzeDrifts('ws-123', 'prop-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('CrossGoalPatternExtractorService', () => {
    it('should extract common planning failures from agent task logs', async () => {
      mockDb.client.agentTask.findMany.mockResolvedValue([
        {
          logs: [
            'Step 1: start underwriting',
            'Step 2: failed due to zoning delay warning from system',
          ],
        },
        {
          logs: [
            'Step 1: load specs',
            'Step 2: utility connection issues occurred',
          ],
        },
      ]);

      const warnings = await extractorService.extractPatterns('ws-123');

      expect(warnings).toContain(
        'Historical zoning delays detected in workspace tasks.',
      );
      expect(warnings).toContain(
        'Common utility connection challenges observed.',
      );
    });
  });

  describe('SecureAnonymizerService', () => {
    it('should redact emails, names, and phone numbers from logs', () => {
      const logs = [
        'User: Jane Smith, John.Doe@example.com asked for underwriting.',
        'Client: John Doe has phone +971-50-1234567.',
      ];

      const cleanLogs = logs.map((l) => anonymizerService.anonymize(l));

      expect(cleanLogs[0]).toContain('User: [REDACTED_NAME]');
      expect(cleanLogs[0]).toContain('[REDACTED_EMAIL]');
      expect(cleanLogs[1]).toContain('Client: [REDACTED_NAME]');
      expect(cleanLogs[1]).toContain('[REDACTED_PHONE]');
    });

    it('should redact US EINs, UAE TRNs, and corporate business names', () => {
      const logs = [
        'Tax ID is 12-3456789 and TRN is 100123456789012.',
        'Please contact Globex Corp or Acme LLC for more information.',
      ];

      const cleanLogs = logs.map((l) => anonymizerService.anonymize(l));

      expect(cleanLogs[0]).toContain('[REDACTED_TAX_ID]');
      expect(cleanLogs[0]).not.toContain('12-3456789');
      expect(cleanLogs[0]).not.toContain('100123456789012');

      expect(cleanLogs[1]).toContain('[REDACTED_COMPANY]');
      expect(cleanLogs[1]).not.toContain('Globex Corp');
      expect(cleanLogs[1]).not.toContain('Acme LLC');
    });

    it('should convert logs to JSONL training format', () => {
      const logs = ['Email: John.Doe@example.com'];
      const jsonl = anonymizerService.convertToTrainingFormat(logs);
      expect(jsonl).toBe(
        '{"prompt":"Execute real estate underwrite task","response":"Email: [REDACTED_EMAIL]"}',
      );
    });
  });
});
