import { BenchmarkRunnerService } from './benchmark-runner.service';
import { BadRequestException } from '@nestjs/common';

describe('Evaluation Operating System & Quality Gates (Release 16)', () => {
  let service: BenchmarkRunnerService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        testSuite: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'suite-123',
            ...data,
          })),
          findUnique: jest.fn(),
        },
        testCase: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'case-999',
            ...data,
          })),
        },
        evaluationRun: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'run-uuid',
            ...data,
            createdAt: new Date(),
          })),
          findMany: jest.fn(),
        },
      },
    };

    service = new BenchmarkRunnerService(mockDb);
  });

  describe('createSuite & createTestCase', () => {
    it('should create test suite and test case successfully', async () => {
      const suite = await service.createSuite(
        'LLM Underwriting Benchmark',
        'Tests capability of underwriting agent',
      );
      expect(suite.id).toBe('suite-123');
      expect(suite.name).toBe('LLM Underwriting Benchmark');

      const testCase = await service.createTestCase(
        'suite-123',
        'Evaluate property Burj Crown yields',
      );
      expect(testCase.id).toBe('case-999');
      expect(testCase.inputGoal).toBe('Evaluate property Burj Crown yields');
    });
  });

  describe('runSuite & Quality Gate Threshold', () => {
    it('should pass quality gate if average correctness >= 80%', async () => {
      const suiteWithCases = {
        id: 'suite-123',
        name: 'High Performance Suite',
        description:
          'Suite with longer goal descriptions to trigger high scores',
        cases: [
          {
            id: 'case-1',
            inputGoal:
              'Analyze Burj Crown yields and lease schedules across 5 years to verify net return stability',
          },
        ],
      };

      mockDb.client.testSuite.findUnique.mockResolvedValue(suiteWithCases);

      const run = await service.runSuite('suite-123', 'commit-hash-abc');

      expect(run.passed).toBe(true);
      expect((run.metrics as any).avgCorrectness).toBeGreaterThanOrEqual(80.0);
      expect(mockDb.client.evaluationRun.create).toHaveBeenCalled();
    });

    it('should fail quality gate if average correctness < 80%', async () => {
      const suiteWithCases = {
        id: 'suite-123',
        name: 'Low Performance Suite',
        description: 'Suite with short inputs to trigger low scores',
        cases: [{ id: 'case-1', inputGoal: 'Short goal' }],
      };

      mockDb.client.testSuite.findUnique.mockResolvedValue(suiteWithCases);

      const run = await service.runSuite('suite-123', 'commit-hash-xyz');

      expect(run.passed).toBe(false);
      expect((run.metrics as any).avgCorrectness).toBeLessThan(80.0);
    });

    it('should throw BadRequestException if suite is not found or empty', async () => {
      mockDb.client.testSuite.findUnique.mockResolvedValue(null);

      await expect(
        service.runSuite('suite-not-found', 'commit-sha'),
      ).rejects.toThrow(BadRequestException);

      mockDb.client.testSuite.findUnique.mockResolvedValue({
        id: 'suite-empty',
        cases: [],
      });
      await expect(
        service.runSuite('suite-empty', 'commit-sha'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
