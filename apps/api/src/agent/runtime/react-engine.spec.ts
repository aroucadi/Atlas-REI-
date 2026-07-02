import { ReActExecutionEngine } from './react-engine';
import { AgentRegistry, ToolRegistry } from './registries';
import { AiGateway } from '@atlas/ai-gateway';

describe('ReActExecutionEngine', () => {
  let mockDbService: any;
  let mockAiGateway: any;
  let context: any;

  beforeEach(() => {
    jest.clearAllMocks();
    AgentRegistry.clear();
    ToolRegistry.clear();

    mockDbService = {
      client: {
        job: {
          findUnique: jest.fn().mockResolvedValue({
            id: 'job-123',
            status: 'running',
            resultRefJson: {},
          }),
          update: jest.fn().mockResolvedValue({}),
        },
        investorProfile: {
          findFirst: jest.fn().mockResolvedValue({
            constraintsJson: {
              policies: {
                requireToolApproval: {
                  submit_investment_decision: true,
                },
              },
            },
          }),
        },
        auditLog: {
          create: jest.fn().mockResolvedValue({}),
        },
      },
    };

    mockAiGateway = new AiGateway();

    context = {
      workspaceId: 'ws-123',
      propertyId: 'prop-123',
      investorProfileId: 'profile-123',
      jobId: 'job-123',
      db: mockDbService,
      aiGateway: mockAiGateway,
      runLogs: [],
      stepTrace: [],
    };

    // Register basic tools for the tests
    ToolRegistry.register({
      name: 'fetch_property_data',
      description: 'Fetch property details',
      version: '1.0.0',
      handler: jest.fn().mockResolvedValue({ name: 'Burj Crown' }),
    });

    ToolRegistry.register({
      name: 'fetch_profile_data',
      description: 'Fetch investor profile',
      version: '1.0.0',
      handler: jest.fn().mockResolvedValue({ requireScreeningApproval: true }),
    });

    ToolRegistry.register({
      name: 'submit_investment_decision',
      description: 'Submit decision',
      version: '1.0.0',
      handler: jest.fn().mockResolvedValue({ success: true }),
    });
  });

  it('should run a ReAct loop successfully in simulation mode', async () => {
    const result = await ReActExecutionEngine.run(
      'test_agent',
      context,
      'Determine if we should invest in property Burj Crown',
    );

    expect(result.status).toBe('completed');
    expect(result.result.answer).toContain(
      'Burj Crown real estate analysis successfully run',
    );
    expect(result.result.steps.length).toBeGreaterThan(0);
  });

  it('should suspend execution when a tool requires approval', async () => {
    // Override simulation next step to call the high risk tool
    jest
      .spyOn(ReActExecutionEngine as any, 'simulateNextStep')
      .mockReturnValue({
        thought: 'I will submit the final decision.',
        action: 'submit_investment_decision',
        actionInput: { propertyId: 'prop-123', decision: 'Buy' },
      });

    const result = await ReActExecutionEngine.run(
      'test_agent',
      context,
      'Finalize decision',
    );

    expect(result.status).toBe('suspended');
    expect(mockDbService.client.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'suspended',
        }),
      }),
    );
  });

  it('should resume execution if the tool call is in approvedActions list', async () => {
    // Mock the job to already contain the approved action matching the tool execution details
    mockDbService.client.job.findUnique.mockResolvedValue({
      id: 'job-123',
      status: 'running',
      resultRefJson: {
        approvedActions: [
          {
            stepIndex: 0,
            toolName: 'submit_investment_decision',
            actionInput: { propertyId: 'prop-123', decision: 'Buy' },
          },
        ],
      },
    });

    // Mock simulateNextStep to request the tool on step 0, and return final answer on step 1
    let callCount = 0;
    jest
      .spyOn(ReActExecutionEngine as any, 'simulateNextStep')
      .mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return {
            thought: 'I will submit the final decision.',
            action: 'submit_investment_decision',
            actionInput: { propertyId: 'prop-123', decision: 'Buy' },
          };
        } else {
          return {
            thought: 'Decision submitted and approved. Completing task.',
            finalAnswer: 'Task complete.',
          };
        }
      });

    const result = await ReActExecutionEngine.run(
      'test_agent',
      context,
      'Finalize decision',
    );

    expect(result.status).toBe('completed');
    expect(result.result.answer).toBe('Task complete.');
  });
});
