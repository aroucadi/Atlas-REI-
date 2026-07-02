import { Test, TestingModule } from '@nestjs/testing';
import { CopilotService } from './copilot.service';
import { DatabaseService } from '../database/database.service';
import { EmbeddingService } from '../document/embedding.service';

describe('CopilotService', () => {
  let service: CopilotService;

  const mockDbService = {
    client: {
      property: {
        findUnique: jest.fn(),
      },
      underwriteRun: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      portfolio: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      shortlist: {
        findFirst: jest.fn(),
      },
      event: {
        findMany: jest.fn(),
      },
      document: {
        findMany: jest.fn(),
      },
    },
  };

  const mockEmbeddingService = {
    semanticSearch: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CopilotService,
        {
          provide: DatabaseService,
          useValue: mockDbService,
        },
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
      ],
    }).compile();

    service = module.get<CopilotService>(CopilotService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should classify and execute summarize_deal tool when linked in workspace', async () => {
    mockDbService.client.underwriteRun.findFirst.mockResolvedValue({
      id: 'run-123',
    });
    mockDbService.client.shortlist.findFirst.mockResolvedValue(null);
    mockDbService.client.portfolio.findFirst.mockResolvedValue(null);
    mockDbService.client.property.findUnique.mockResolvedValue({
      id: '00000000-0000-0000-0000-000000000002',
      propertyType: 'apartment',
      interiorAreaSqm: 80,
      building: { name: 'Burj Crown' },
      city: { name: 'Dubai' },
    });

    const result = await service.handleChat('workspace-123', 'user-123', {
      message: 'Summarize property details for this deal',
      propertyId: '00000000-0000-0000-0000-000000000002',
    });

    expect(result).toBeDefined();
    expect(result.answer).toContain('Burj Crown');
    expect(result.toolsUsed).toHaveLength(1);
    expect(result.toolsUsed[0].name).toBe('summarize_deal');
    expect(mockDbService.client.property.findUnique).toHaveBeenCalledWith({
      where: { id: '00000000-0000-0000-0000-000000000002' },
      include: { building: true, city: true },
    });
  });

  it('should block summarize_deal tool if property is not linked in workspace', async () => {
    mockDbService.client.underwriteRun.findFirst.mockResolvedValue(null);
    mockDbService.client.shortlist.findFirst.mockResolvedValue(null);
    mockDbService.client.portfolio.findFirst.mockResolvedValue(null);

    const result = await service.handleChat('workspace-123', 'user-123', {
      message: 'Summarize property details for this deal',
      propertyId: '00000000-0000-0000-0000-000000000002',
    });

    expect(result).toBeDefined();
    expect(result.toolsUsed[0].resultSummary).toContain(
      'not found in active workspace context',
    );
  });

  it('should classify and execute explain_verdict tool for valid workspace run', async () => {
    mockDbService.client.underwriteRun.findFirst.mockResolvedValue({
      id: 'run-123',
      investmentDecisions: [
        {
          verdict: 'Buy',
          thesisSummary: 'Strong yield',
          objectionsSummary: 'None',
        },
      ],
    });

    const result = await service.handleChat('workspace-123', 'user-123', {
      message: 'Explain this verdict for me',
      underwriteRunId: 'run-123',
    });

    expect(result).toBeDefined();
    expect(result.answer).toContain('Buy');
    expect(result.toolsUsed).toHaveLength(1);
    expect(result.toolsUsed[0].name).toBe('explain_verdict');
    expect(mockDbService.client.underwriteRun.findFirst).toHaveBeenCalledWith({
      where: {
        id: '00000000-0000-0000-0000-000000000000',
        workspaceId: 'workspace-123',
      },
      include: {
        investmentDecisions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  });

  it('should return error in explain_verdict tool if run is not found in active workspace', async () => {
    mockDbService.client.underwriteRun.findFirst.mockResolvedValue(null);

    const result = await service.handleChat('workspace-123', 'user-123', {
      message: 'Explain this verdict for me',
      underwriteRunId: 'run-123',
    });

    expect(result).toBeDefined();
    expect(result.toolsUsed[0].resultSummary).toContain(
      'not found in active workspace context',
    );
  });
});
