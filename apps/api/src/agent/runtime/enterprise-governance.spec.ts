import { WorkspaceMembershipGuard } from '../../auth/workspace-membership.guard';
import { AuditLogService } from '../../database/audit-log.service';
import { ReActExecutionEngine } from './react-engine';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('Enterprise Governance (Release 12)', () => {
  describe('WorkspaceMembershipGuard - RBAC checks', () => {
    let guard: WorkspaceMembershipGuard;
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        client: {
          workspace: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ id: 'ws-123', organizationId: 'org-123' }),
          },
          organizationMembership: {
            findFirst: jest.fn(),
          },
        },
      };
      guard = new WorkspaceMembershipGuard(mockDb);
    });

    it('should allow GET access for viewer role', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-123' },
            params: { workspaceId: 'ws-123' },
            method: 'GET',
          }),
        }),
      } as any;

      mockDb.client.organizationMembership.findFirst.mockResolvedValue({
        role: 'viewer',
      });

      const allowed = await guard.canActivate(context);
      expect(allowed).toBe(true);
    });

    it('should block POST/write access for viewer role', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-123' },
            params: { workspaceId: 'ws-123' },
            method: 'POST',
          }),
        }),
      } as any;

      mockDb.client.organizationMembership.findFirst.mockResolvedValue({
        role: 'viewer',
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should allow POST/write access for admin or analyst role', async () => {
      const context = {
        switchToHttp: () => ({
          getRequest: () => ({
            user: { id: 'user-123' },
            params: { workspaceId: 'ws-123' },
            method: 'POST',
          }),
        }),
      } as any;

      mockDb.client.organizationMembership.findFirst.mockResolvedValue({
        role: 'analyst',
      });

      const allowed = await guard.canActivate(context);
      expect(allowed).toBe(true);
    });
  });

  describe('AuditLogService - WORM compliance checks', () => {
    let service: AuditLogService;
    let mockDb: any;

    beforeEach(() => {
      mockDb = {
        client: {
          auditLog: {
            create: jest.fn().mockResolvedValue({ id: 'log-123' }),
          },
        },
      };
      service = new AuditLogService(mockDb);
    });

    it('should allow writing audit logs', async () => {
      const log = await service.log({
        entityType: 'agent',
        entityId: 'agent-123',
        action: 'execute',
      });
      expect(log.id).toBe('log-123');
      expect(mockDb.client.auditLog.create).toHaveBeenCalled();
    });

    it('should forbid updating logs', async () => {
      await expect(service.updateAuditLog()).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should forbid deleting logs', async () => {
      await expect(service.deleteAuditLog()).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('ReActExecutionEngine - Budget ceilings check', () => {
    let mockDb: any;
    let mockAiGateway: any;
    let context: any;

    beforeEach(() => {
      mockDb = {
        client: {
          job: {
            findUnique: jest
              .fn()
              .mockResolvedValue({ id: 'job-123', status: 'running' }),
            update: jest.fn(),
          },
          investorProfile: {
            findFirst: jest.fn().mockResolvedValue({
              id: 'profile-123',
              constraintsJson: {
                accumulatedSpend: 10.0,
                monthlyBudgetCap: 5.0, // Budget exceeded!
              },
            }),
          },
        },
      };

      mockAiGateway = {
        isSimulationMode: () => true,
      };

      context = {
        workspaceId: 'ws-123',
        propertyId: 'prop-123',
        jobId: 'job-123',
        db: mockDb,
        aiGateway: mockAiGateway,
        runLogs: [],
        stepTrace: [],
      };
    });

    it('should block execution if monthly budget is exceeded', async () => {
      await expect(
        ReActExecutionEngine.run(
          'test_agent',
          context,
          'Determine investment options',
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
