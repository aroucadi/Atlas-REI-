import { ModelRouterService } from './model-router.service';
import { PromptOptimizerService } from './prompt-optimizer.service';
import { BadRequestException } from '@nestjs/common';

describe('Self-Optimizing Agentic Platform (Release 18)', () => {
  let modelRouter: ModelRouterService;
  let optimizer: PromptOptimizerService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        optimizationProposal: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'proposal-123',
            ...data,
            createdAt: new Date(),
          })),
          findFirst: jest.fn(),
          update: jest.fn().mockImplementation(({ where, data }) => ({
            id: where.id,
            status: data.status,
          })),
          findMany: jest.fn(),
        },
      },
    };

    modelRouter = new ModelRouterService();
    optimizer = new PromptOptimizerService(mockDb);
  });

  describe('ModelRouterService', () => {
    it('should route to gemini-1.5-pro for high complexity tasks', () => {
      const res = modelRouter.selectModel('high');
      expect(res.model).toBe('gemini-1.5-pro');
      expect(res.temperature).toBe(0.0);
    });

    it('should route to gemini-1.5-flash for low complexity tasks', () => {
      const res = modelRouter.selectModel('low');
      expect(res.model).toBe('gemini-1.5-flash');
      expect(res.temperature).toBe(0.2);
    });
  });

  describe('PromptOptimizerService & Governance Gates', () => {
    const originalConfig = {
      name: 'diligence_prompt',
      systemInstruction: 'Analyze the lease schedule.',
    };

    it('should create an optimization proposal with PENDING_APPROVAL status', async () => {
      const proposal = await optimizer.proposeOptimization(
        'ws-123',
        'Prompt Config',
        originalConfig,
        'Zoning code parsing failure',
      );

      expect(proposal.workspaceId).toBe('ws-123');
      expect(proposal.targetArea).toBe('Prompt Config');
      expect(proposal.status).toBe('PENDING_APPROVAL');
      expect((proposal.proposedConfig as any).systemInstruction).toContain(
        '# Self-Optimized Correction',
      );
      expect(mockDb.client.optimizationProposal.create).toHaveBeenCalled();
    });

    it('should approve a pending proposal', async () => {
      mockDb.client.optimizationProposal.findFirst.mockResolvedValue({
        id: 'proposal-123',
        workspaceId: 'ws-123',
        status: 'PENDING_APPROVAL',
      });

      const approved = await optimizer.approveProposal(
        'ws-123',
        'proposal-123',
      );

      expect(approved.status).toBe('APPROVED');
      expect(mockDb.client.optimizationProposal.update).toHaveBeenCalledWith({
        where: { id: 'proposal-123' },
        data: { status: 'APPROVED' },
      });
    });

    it('should reject a pending proposal', async () => {
      mockDb.client.optimizationProposal.findFirst.mockResolvedValue({
        id: 'proposal-123',
        workspaceId: 'ws-123',
        status: 'PENDING_APPROVAL',
      });

      const rejected = await optimizer.rejectProposal('ws-123', 'proposal-123');

      expect(rejected.status).toBe('REJECTED');
    });

    it('should throw BadRequestException if proposal already processed', async () => {
      mockDb.client.optimizationProposal.findFirst.mockResolvedValue({
        id: 'proposal-123',
        workspaceId: 'ws-123',
        status: 'APPROVED',
      });

      await expect(
        optimizer.approveProposal('ws-123', 'proposal-123'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
