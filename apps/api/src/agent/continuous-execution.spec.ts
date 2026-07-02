import { Test, TestingModule } from '@nestjs/testing';
import { ContinuousExecutionService } from './continuous-execution.service';
import { ReflectionEngine, LoopException } from './runtime/reflection.engine';
import { DatabaseService } from '../database/database.service';
import { BadRequestException } from '@nestjs/common';

describe('ContinuousExecutionService & ReflectionEngine', () => {
  let executionService: ContinuousExecutionService;
  let reflectionEngine: ReflectionEngine;

  const mockDbService = {
    client: {
      kernelProcess: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      goal: {
        update: jest.fn(),
      },
      objective: {
        findFirst: jest.fn(),
      },
      evidence: {
        findFirst: jest.fn(),
      },
      shortlistItem: {
        findFirst: jest.fn(),
      },
      investmentDecision: {
        findFirst: jest.fn(),
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ContinuousExecutionService,
        ReflectionEngine,
        {
          provide: DatabaseService,
          useValue: mockDbService,
        },
      ],
    }).compile();

    executionService = module.get<ContinuousExecutionService>(
      ContinuousExecutionService,
    );
    reflectionEngine = module.get<ReflectionEngine>(ReflectionEngine);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ReflectionEngine - Loop Detector', () => {
    it('should NOT throw an error for unique tool calls or < 3 calls of the same signature', () => {
      const steps = [
        { action: 'fetch_property_data', actionInput: { propertyId: '1' } },
        { action: 'fetch_property_data', actionInput: { propertyId: '1' } },
        { action: 'fetch_property_data', actionInput: { propertyId: '2' } },
        { action: 'fetch_property_data', actionInput: { propertyId: '1' } },
      ];
      expect(() => reflectionEngine.detectLoops(steps)).not.toThrow();
    });

    it('should throw a LoopException if a tool signature is executed > 3 times', () => {
      const steps = [
        { action: 'fetch_property_data', actionInput: { propertyId: '1' } },
        { action: 'fetch_property_data', actionInput: { propertyId: '1' } },
        { action: 'fetch_property_data', actionInput: { propertyId: '1' } },
        { action: 'fetch_property_data', actionInput: { propertyId: '1' } },
      ];
      expect(() => reflectionEngine.detectLoops(steps)).toThrow(LoopException);
    });
  });

  describe('ReflectionEngine - Progress Validator (Hallucination Detector)', () => {
    it('should validate progress successfully when no claims are made', async () => {
      const res = await reflectionEngine.validateProgress(
        'workspace-123',
        'Did some basic analysis.',
        [],
      );
      expect(res.valid).toBe(true);
    });

    it('should flag as hallucination if agent claims to create evidence but none is in the database', async () => {
      mockDbService.client.evidence.findFirst.mockResolvedValue(null);
      const res = await reflectionEngine.validateProgress(
        'workspace-123',
        'I have created evidence for Burj Crown.',
        [],
      );
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Hallucination Detected');
    });

    it('should pass validation if agent claims to create evidence and record exists in DB', async () => {
      mockDbService.client.evidence.findFirst.mockResolvedValue({
        id: 'ev-123',
        createdAt: new Date(),
      });
      const res = await reflectionEngine.validateProgress(
        'workspace-123',
        'I have created evidence for Burj Crown.',
        [],
      );
      expect(res.valid).toBe(true);
    });
  });

  describe('ContinuousExecutionService', () => {
    it('should halt execution and request escalation if a governance action is encountered', async () => {
      const mockProcess = {
        id: 'proc-123',
        workspaceId: 'workspace-123',
        goalId: 'goal-123',
        allocatedTokens: 0,
        stepLimit: 5,
        status: 'READY',
        goal: {
          id: 'goal-123',
          title: 'Secure Burj Crown Investment',
          executionTree: {},
        },
      };

      mockDbService.client.kernelProcess.findFirst.mockResolvedValue(
        mockProcess,
      );
      mockDbService.client.kernelProcess.update.mockResolvedValue({});
      mockDbService.client.goal.update.mockResolvedValue({});

      // Set the loopState to skip directly to step 1 (which calls move_capital)
      mockProcess.goal.executionTree = {
        loopState: {
          steps: [
            {
              thought: 'Step 1 done',
              action: 'fetch_property_data',
              actionInput: {},
              observation: '{}',
            },
          ],
          currentStepIndex: 1,
          tokenSpend: 150,
          maxTokens: 1000,
        },
      };

      const result = await executionService.executeCycle(
        'workspace-123',
        'proc-123',
      );

      expect(result.status).toBe('AWAITING_ESCALATION');
      expect(result.message).toContain('requires explicit human authorization');
      expect(mockDbService.client.kernelProcess.update).toHaveBeenCalledWith({
        where: { id: 'proc-123' },
        data: { status: 'AWAITING_ESCALATION' },
      });
    });

    it('should throw an error if the budget cap (maxTokens) is exceeded', async () => {
      const mockProcess = {
        id: 'proc-123',
        workspaceId: 'workspace-123',
        goalId: 'goal-123',
        allocatedTokens: 1050,
        stepLimit: 5,
        status: 'READY',
        goal: {
          id: 'goal-123',
          title: 'Secure Burj Crown Investment',
          executionTree: {
            loopState: {
              steps: [],
              currentStepIndex: 0,
              tokenSpend: 1050,
              maxTokens: 1000,
            },
          },
        },
      };

      mockDbService.client.kernelProcess.findFirst.mockResolvedValue(
        mockProcess,
      );

      await expect(
        executionService.executeCycle('workspace-123', 'proc-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
