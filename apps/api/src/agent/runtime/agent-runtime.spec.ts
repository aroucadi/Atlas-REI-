import { AgentRegistry, ToolRegistry } from './registries';
import { PolicyEngine } from './policy-engine';
import { AgentRuntimeCore } from './agent-runtime.core';
import { EvaluationHarness } from './evaluation-harness';
import { RunContext } from './types';
import { AiGateway } from '@atlas/ai-gateway';
import { BadRequestException } from '@nestjs/common';

describe('AgentRuntime', () => {
  let mockDbService: any;
  let mockAiGateway: any;
  let context: RunContext;

  beforeEach(() => {
    jest.clearAllMocks();
    AgentRegistry.clear();
    ToolRegistry.clear();

    mockDbService = {
      client: {
        job: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ id: 'job-123', status: 'running' }),
          update: jest.fn(),
        },
        aiRun: {
          create: jest.fn(),
        },
      },
    };

    mockAiGateway = new AiGateway();

    context = {
      workspaceId: 'ws-123',
      propertyId: 'prop-123',
      jobId: 'job-123',
      db: mockDbService,
      aiGateway: mockAiGateway,
      runLogs: [],
      stepTrace: [],
    };
  });

  describe('Registries', () => {
    it('should register and retrieve agents', () => {
      const agentDef = {
        id: 'test_agent',
        name: 'Test Agent',
        description: 'Testing purposes',
        version: '1.0.0',
        requiredTools: ['tool1'],
        policies: [],
        systemInstruction: 'Be helpful',
      };

      AgentRegistry.register(agentDef);
      expect(AgentRegistry.get('test_agent')).toEqual(agentDef);
      expect(AgentRegistry.list()).toContainEqual(agentDef);
    });

    it('should register and retrieve tools', () => {
      const toolDef = {
        name: 'tool1',
        description: 'Test Tool',
        version: '1.0.0',
        handler: jest.fn(),
      };

      ToolRegistry.register(toolDef);
      expect(ToolRegistry.get('tool1')).toEqual(toolDef);
      expect(ToolRegistry.list()).toContainEqual(toolDef);
    });
  });

  describe('PolicyEngine', () => {
    it('should fail if agent calls unregistered tool', () => {
      const agent = {
        id: 'test_agent',
        name: 'Test Agent',
        description: 'Testing',
        version: '1.0.0',
        requiredTools: ['tool1'],
        policies: [],
        systemInstruction: '',
      };

      expect(() => {
        PolicyEngine.evaluateToolPolicy(agent, 'tool2');
      }).toThrow(BadRequestException);
    });

    it('should pass if agent calls registered tool', () => {
      const agent = {
        id: 'test_agent',
        name: 'Test Agent',
        description: 'Testing',
        version: '1.0.0',
        requiredTools: ['tool1'],
        policies: [],
        systemInstruction: '',
      };

      expect(() => {
        PolicyEngine.evaluateToolPolicy(agent, 'tool1');
      }).not.toThrow();
    });

    it('should correctly flag required approvals', () => {
      expect(
        PolicyEngine.requiresApproval('multi_agent_workflow', 'screening'),
      ).toBe(true);
      expect(
        PolicyEngine.requiresApproval('multi_agent_workflow', 'diligence'),
      ).toBe(false);
      expect(
        PolicyEngine.requiresApproval('investment_memo', 'some_step'),
      ).toBe(true);
    });

    it('should correctly flag required approvals with dynamic config override', () => {
      const configWithBypass = {
        requireScreeningApproval: false,
        requireMemoApproval: false,
      };

      expect(
        PolicyEngine.requiresApproval(
          'multi_agent_workflow',
          'screening',
          configWithBypass,
        ),
      ).toBe(false);
      expect(
        PolicyEngine.requiresApproval(
          'multi_agent_workflow',
          'memo',
          configWithBypass,
        ),
      ).toBe(false);
      expect(
        PolicyEngine.requiresApproval(
          'investment_memo',
          'some_step',
          configWithBypass,
        ),
      ).toBe(false);

      const configWithEnforce = {
        requireScreeningApproval: true,
        requireMemoApproval: true,
      };

      expect(
        PolicyEngine.requiresApproval(
          'multi_agent_workflow',
          'screening',
          configWithEnforce,
        ),
      ).toBe(true);
      expect(
        PolicyEngine.requiresApproval(
          'multi_agent_workflow',
          'memo',
          configWithEnforce,
        ),
      ).toBe(true);
    });
  });

  describe('EvaluationHarness', () => {
    it('should grade successful runs', () => {
      const metrics = EvaluationHarness.evaluateRun([], [], 1500, 0.005, true);
      expect(metrics.correctness).toBe(100);
      expect(metrics.toolDiscipline).toBe(100);
      expect(metrics.failureRate).toBe(0);
    });

    it('should grade failed runs', () => {
      const metrics = EvaluationHarness.evaluateRun([], [], 500, 0, false);
      expect(metrics.correctness).toBe(0);
      expect(metrics.failureRate).toBe(1);
    });
  });

  describe('AgentRuntimeCore', () => {
    beforeEach(() => {
      AgentRegistry.register({
        id: 'test_agent',
        name: 'Test Agent',
        description: 'Testing',
        version: '1.0.0',
        requiredTools: [],
        policies: [],
        systemInstruction: '',
      });
    });

    it('should execute step successfully', async () => {
      const executor = jest.fn().mockResolvedValue('success-payload');

      const result = await AgentRuntimeCore.executeStep(
        'test_agent',
        'step1',
        context,
        executor,
      );

      expect(result).toBe('success-payload');
      expect(executor).toHaveBeenCalledTimes(1);
      expect(mockDbService.client.aiRun.create).toHaveBeenCalled();
    });

    it('should retry transient errors and eventually fail', async () => {
      const executor = jest
        .fn()
        .mockRejectedValue(new Error('Transient error'));

      await expect(
        AgentRuntimeCore.executeStep('test_agent', 'step1', context, executor, {
          retries: 2,
          backoffMs: 1,
        }),
      ).rejects.toThrow('Transient error');

      expect(executor).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should stop execution if job is cancelled', async () => {
      mockDbService.client.job.findUnique.mockResolvedValue({
        id: 'job-123',
        status: 'failed', // job aborted/cancelled
      });

      const executor = jest.fn();

      await expect(
        AgentRuntimeCore.executeStep('test_agent', 'step1', context, executor),
      ).rejects.toThrow('Job execution terminated.');

      expect(executor).not.toHaveBeenCalled();
    });
  });
});
