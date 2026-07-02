import { Test, TestingModule } from '@nestjs/testing';
import { AgentService } from './agent.service';
import { DatabaseService } from '../database/database.service';
import { getQueueToken } from '@nestjs/bullmq';
import { EmbeddingService } from '../document/embedding.service';
import { PromptRegistryService } from './prompt-registry.service';

describe('AgentService', () => {
  let service: AgentService;

  const mockDbService = {
    client: {
      $transaction: jest
        .fn()
        .mockImplementation((callback) => callback(mockDbService.client)),
      property: {
        findUnique: jest.fn(),
      },
      job: {
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findUnique: jest.fn(),
        findMany: jest.fn(),
      },
      underwriteRun: {
        findFirst: jest.fn(),
      },
      investmentDecision: {
        findFirst: jest.fn(),
      },
      evidence: {
        findMany: jest.fn(),
      },
      investorProfile: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
      },
      document: {
        create: jest.fn(),
      },
      aiRun: {
        create: jest.fn().mockResolvedValue({}),
      },
      agentTask: {
        create: jest.fn().mockResolvedValue({}),
        upsert: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    },
  };

  const mockQueue = {
    add: jest.fn().mockResolvedValue({ id: 'mock-bull-id' }),
  };

  const mockEmbeddingService = {
    semanticSearch: jest.fn().mockResolvedValue([]),
  };

  const mockPromptRegistryService = {
    getPrompt: jest
      .fn()
      .mockImplementation((name) => `Mock prompt for ${name}`),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentService,
        {
          provide: DatabaseService,
          useValue: mockDbService,
        },
        {
          provide: getQueueToken('agent-queue'),
          useValue: mockQueue,
        },
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
        {
          provide: PromptRegistryService,
          useValue: mockPromptRegistryService,
        },
      ],
    }).compile();

    service = module.get<AgentService>(AgentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // --- Single Agent Memo Tests ---
  it('should trigger a memo job successfully', async () => {
    mockDbService.client.property.findUnique.mockResolvedValue({
      id: 'prop-123',
    });
    mockDbService.client.job.create.mockResolvedValue({
      id: 'job-123',
      status: 'queued',
      progressPct: 0,
      inputJson: { propertyId: 'prop-123' },
    });

    const result = await service.triggerMemoJob(
      'workspace-123',
      'user-123',
      'prop-123',
    );

    expect(result).toBeDefined();
    expect(result.status).toBe('queued');
    expect(mockDbService.client.job.create).toHaveBeenCalled();
  });

  it('should approve a memo and finalize a document', async () => {
    mockDbService.client.job.findUnique.mockResolvedValue({
      id: 'job-123',
      workspaceId: 'workspace-123',
      status: 'awaiting_approval',
      resultRefJson: {
        memoText: 'Mock Memo Content',
        propertyId: 'prop-123',
      },
    });

    mockDbService.client.document.create.mockResolvedValue({
      id: 'doc-123',
      documentType: 'investment_memo',
    });

    mockDbService.client.job.update.mockResolvedValue({
      id: 'job-123',
      status: 'completed',
    });

    const result = await service.approveMemo('workspace-123', 'job-123');

    expect(result.status).toBe('completed');
    expect(mockDbService.client.document.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'workspace-123',
        entityType: 'property',
        entityId: 'prop-123',
        documentType: 'investment_memo',
        fileName: 'investment_memo_job-123.md',
        storagePath: 'memos/memo-job-123.md',
        mimeType: 'text/markdown',
        status: 'completed',
      },
    });
  });

  it('should reject a memo and fail the job', async () => {
    mockDbService.client.job.findUnique.mockResolvedValue({
      id: 'job-123',
      workspaceId: 'workspace-123',
      status: 'awaiting_approval',
    });

    mockDbService.client.job.update.mockResolvedValue({
      id: 'job-123',
      status: 'failed',
    });

    const result = await service.rejectMemo('workspace-123', 'job-123');

    expect(result.status).toBe('failed');
    expect(mockDbService.client.job.update).toHaveBeenCalledWith({
      where: { id: 'job-123' },
      data: {
        status: 'failed',
        errorMessage: 'Rejected by user review checkpoint.',
      },
    });
  });

  // --- Coordinated Multi-Agent Workflow Tests ---
  it('should trigger a workflow job and start screening', async () => {
    mockDbService.client.property.findUnique.mockResolvedValue({
      id: 'prop-123',
    });
    mockDbService.client.investorProfile.findUnique.mockResolvedValue({
      id: 'profile-123',
      workspaceId: 'workspace-123',
    });
    mockDbService.client.job.create.mockResolvedValue({
      id: 'job-555',
      status: 'queued',
      jobType: 'multi_agent_workflow',
      resultRefJson: { step: 'screening' },
    });

    const result = await service.triggerWorkflowJob(
      'workspace-123',
      'user-123',
      'prop-123',
      'profile-123',
    );

    expect(result).toBeDefined();
    expect(result.status).toBe('queued');
    expect(mockDbService.client.job.create).toHaveBeenCalled();
  });

  it('should transition to blocked if underwriting run is missing', async () => {
    mockDbService.client.property.findUnique.mockResolvedValue({
      id: 'prop-123',
    });
    mockDbService.client.investorProfile.findUnique.mockResolvedValue({
      id: 'profile-123',
      workspaceId: 'workspace-123',
    });
    mockDbService.client.underwriteRun.findFirst.mockResolvedValue(null);

    // Call private processScreeningBackground method
    await (service as any).processScreeningBackground(
      'job-555',
      'workspace-123',
      'prop-123',
      'profile-123',
    );

    expect(mockDbService.client.job.update).toHaveBeenCalledWith({
      where: { id: 'job-555' },
      data: expect.objectContaining({
        status: 'blocked',
        progressPct: 20,
        errorMessage: expect.stringContaining(
          'Missing active underwriting run',
        ),
      }),
    });
  });

  it('should approve screening, compile screening document, and proceed', async () => {
    mockDbService.client.job.findUnique.mockResolvedValue({
      id: 'job-555',
      workspaceId: 'workspace-123',
      status: 'awaiting_approval',
      resultRefJson: {
        step: 'screening',
        propertyId: 'prop-123',
        investorProfileId: 'profile-123',
        screeningResult: {
          score: 85,
          verdict: 'Pass',
          thesis: 'Great Fit',
        },
      },
    });

    mockDbService.client.document.create.mockResolvedValue({
      id: 'doc-screening-123',
      documentType: 'screening_report',
    });

    mockDbService.client.job.update.mockResolvedValue({
      id: 'job-555',
      status: 'running',
    });

    const result = await service.approveScreening('workspace-123', 'job-555');

    expect(result).toBeDefined();
    expect(mockDbService.client.document.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'workspace-123',
        entityType: 'property',
        entityId: 'prop-123',
        documentType: 'screening_report',
        fileName: 'screening_report_job-555.md',
        storagePath: 'screening/report-job-555.md',
        mimeType: 'text/markdown',
        status: 'completed',
      },
    });
  });

  it('should reject screening and terminate workflow', async () => {
    mockDbService.client.job.findUnique.mockResolvedValue({
      id: 'job-555',
      workspaceId: 'workspace-123',
      status: 'awaiting_approval',
      resultRefJson: {
        step: 'screening',
      },
    });

    mockDbService.client.job.update.mockResolvedValue({
      id: 'job-555',
      status: 'failed',
    });

    const result = await service.rejectScreening('workspace-123', 'job-555');

    expect(result.status).toBe('failed');
    expect(mockDbService.client.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-555' },
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'Rejected at screening human gate.',
        }),
      }),
    );
  });

  it('should approve workflow memo, compile final memo document, and complete job', async () => {
    mockDbService.client.job.findUnique.mockResolvedValue({
      id: 'job-555',
      workspaceId: 'workspace-123',
      status: 'awaiting_approval',
      resultRefJson: {
        step: 'memo',
        propertyId: 'prop-123',
        memoResult: {
          memoText: 'Final Memo Content',
        },
      },
    });

    mockDbService.client.document.create.mockResolvedValue({
      id: 'doc-memo-123',
      documentType: 'investment_memo',
    });

    mockDbService.client.job.update.mockResolvedValue({
      id: 'job-555',
      status: 'completed',
    });

    const result = await service.approveWorkflowMemo(
      'workspace-123',
      'job-555',
    );

    expect(result.status).toBe('completed');
    expect(mockDbService.client.document.create).toHaveBeenCalledWith({
      data: {
        workspaceId: 'workspace-123',
        entityType: 'property',
        entityId: 'prop-123',
        documentType: 'investment_memo',
        fileName: 'investment_memo_job-555.md',
        storagePath: 'memos/memo-job-555.md',
        mimeType: 'text/markdown',
        status: 'completed',
      },
    });
  });

  it('should reject workflow memo and terminate workflow', async () => {
    mockDbService.client.job.findUnique.mockResolvedValue({
      id: 'job-555',
      workspaceId: 'workspace-123',
      status: 'awaiting_approval',
      resultRefJson: {
        step: 'memo',
      },
    });

    mockDbService.client.job.update.mockResolvedValue({
      id: 'job-555',
      status: 'failed',
    });

    const result = await service.rejectWorkflowMemo('workspace-123', 'job-555');

    expect(result.status).toBe('failed');
    expect(mockDbService.client.job.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'job-555' },
        data: expect.objectContaining({
          status: 'failed',
          errorMessage: 'Rejected at memo human gate.',
        }),
      }),
    );
  });

  it('should clean up lingering queued or running background jobs on module init', async () => {
    mockDbService.client.job.updateMany.mockResolvedValue({ count: 3 });

    await service.onModuleInit();

    expect(mockDbService.client.job.updateMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: ['queued', 'running'],
        },
      },
      data: {
        status: 'failed',
        errorMessage: 'Server restarted. Job aborted.',
      },
    });
  });

  describe('ReAct loop actions approvals', () => {
    it('should approve a suspended action, update job, and queue resumption task', async () => {
      const jobId = 'job-456';
      mockDbService.client.job.findUnique.mockResolvedValue({
        id: jobId,
        workspaceId: 'ws-123',
        status: 'suspended',
        jobType: 'investment_memo',
        inputJson: { propertyId: 'prop-123' },
        resultRefJson: {
          pendingAction: {
            stepIndex: 0,
            toolName: 'submit_investment_decision',
            actionInput: { propertyId: 'prop-123', decision: 'Buy' },
          },
          approvedActions: [],
        },
      });

      mockDbService.client.job.update.mockResolvedValue({
        id: jobId,
        status: 'running',
      });

      await service.approveAction(
        'ws-123',
        jobId,
        'submit_investment_decision',
      );

      expect(mockDbService.client.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: 'running',
            resultRefJson: expect.objectContaining({
              pendingAction: null,
              approvedActions: [
                {
                  stepIndex: 0,
                  toolName: 'submit_investment_decision',
                  actionInput: { propertyId: 'prop-123', decision: 'Buy' },
                },
              ],
            }),
          }),
        }),
      );
      expect(mockQueue.add).toHaveBeenCalled();
    });

    it('should reject a suspended action and fail the job', async () => {
      const jobId = 'job-456';
      mockDbService.client.job.findUnique.mockResolvedValue({
        id: jobId,
        workspaceId: 'ws-123',
        status: 'suspended',
      });

      await service.rejectAction('ws-123', jobId, 'submit_investment_decision');

      expect(mockDbService.client.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: jobId },
          data: expect.objectContaining({
            status: 'failed',
            errorMessage: expect.stringContaining('rejected'),
          }),
        }),
      );
    });
  });
});
