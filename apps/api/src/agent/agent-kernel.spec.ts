import { AgentKernelService } from './agent-kernel.service';
import { SyscallHandlerService } from './syscall-handler.service';
import { BadRequestException } from '@nestjs/common';

describe('Agent Kernel & Virtualized Processes (Release 17)', () => {
  let kernelService: AgentKernelService;
  let syscallService: SyscallHandlerService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      client: {
        goal: {
          findFirst: jest.fn(),
        },
        kernelProcess: {
          create: jest.fn().mockImplementation(({ data }) => ({
            id: 'proc-uuid-1',
            createdAt: new Date(),
            ...data,
          })),
          findFirst: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn(),
        },
        property: {
          findMany: jest.fn(),
        },
        document: {
          findFirst: jest.fn(),
        },
      },
    };

    kernelService = new AgentKernelService(mockDb);
    syscallService = new SyscallHandlerService(mockDb);
  });

  describe('Process Creation & Scheduling', () => {
    it('should create a process with priority successfully', async () => {
      mockDb.client.goal.findFirst.mockResolvedValue({
        id: 'goal-123',
        workspaceId: 'ws-123',
      });

      const proc = await kernelService.createProcess('ws-123', 'goal-123', 8);

      expect(proc.workspaceId).toBe('ws-123');
      expect(proc.goalId).toBe('goal-123');
      expect(proc.priority).toBe(8);
      expect(proc.status).toBe('READY');
    });

    it('should fetch next process ordered by priority', async () => {
      mockDb.client.kernelProcess.findFirst.mockImplementation(() => {
        // Mock DB implementation mimicking order by priority desc
        return Promise.resolve({ id: 'proc-highest', priority: 10 });
      });

      const next = await kernelService.getNextReadyProcess('ws-123');
      expect(next?.id).toBe('proc-highest');
    });
  });

  describe('Syscall Gating & Preemption', () => {
    it('should allow syscall executions for running processes', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue({
        id: 'proc-1',
        workspaceId: 'ws-123',
        status: 'RUNNING',
        stepLimit: 10,
        allocatedTokens: 100,
      });

      const res = await syscallService.executeSyscall(
        'ws-123',
        'proc-1',
        'db_read',
        {
          stepIndex: 1,
        },
      );

      expect(res.success).toBe(true);
    });

    it('should block syscall executions if there is workspace tenancy mismatch', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue(null);

      await expect(
        syscallService.executeSyscall('ws-different', 'proc-1', 'db_read'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should preempt processes when they exceed the step limit', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue({
        id: 'proc-1',
        workspaceId: 'ws-123',
        status: 'RUNNING',
        stepLimit: 5,
        allocatedTokens: 100,
      });

      await expect(
        syscallService.executeSyscall('ws-123', 'proc-1', 'db_read', {
          stepIndex: 5,
        }), // stepIndex 5 => 6th step > stepLimit 5
      ).rejects.toThrow(/Preemption Veto: process step limit/);

      expect(mockDb.client.kernelProcess.update).toHaveBeenCalledWith({
        where: { id: 'proc-1' },
        data: { status: 'PREEMPTED' },
      });
    });

    it('should preempt processes when they exceed the allocated token budget', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue({
        id: 'proc-1',
        workspaceId: 'ws-123',
        status: 'RUNNING',
        stepLimit: 10,
        allocatedTokens: 950,
      });

      await expect(
        syscallService.executeSyscall('ws-123', 'proc-1', 'llm_call', {
          stepIndex: 1,
          estimatedTokens: 100, // 950 + 100 = 1050 > 1000 limit
        }),
      ).rejects.toThrow(/Preemption Veto: process token budget/);

      expect(mockDb.client.kernelProcess.update).toHaveBeenCalledWith({
        where: { id: 'proc-1' },
        data: { status: 'PREEMPTED' },
      });
    });

    it('should execute a tool script inside a vm step-limited context successfully', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue({
        id: 'proc-1',
        workspaceId: 'ws-123',
        status: 'RUNNING',
        stepLimit: 10,
        allocatedTokens: 100,
      });
      mockDb.client.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        workspaceId: 'ws-123',
      });

      const res = await syscallService.executeSyscall(
        'ws-123',
        'proc-1',
        'tool_exec',
        {
          sourceDocumentId: 'doc-1',
          toolScript: 'result = args.a + args.b;',
          args: { a: 5, b: 10 },
        },
      );

      expect(res.success).toBe(true);
      expect(res.result).toBe(15);
    });

    it('should throw an error and fail execution if tool script attempts to access global environment variables (process)', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue({
        id: 'proc-1',
        workspaceId: 'ws-123',
        status: 'RUNNING',
        stepLimit: 10,
        allocatedTokens: 100,
      });
      mockDb.client.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        workspaceId: 'ws-123',
      });

      await expect(
        syscallService.executeSyscall('ws-123', 'proc-1', 'tool_exec', {
          sourceDocumentId: 'doc-1',
          toolScript: 'result = process.env;',
        }),
      ).rejects.toThrow(/process is not defined/);
    });

    it('should throw an error and fail execution if tool script attempts to import modules (require)', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue({
        id: 'proc-1',
        workspaceId: 'ws-123',
        status: 'RUNNING',
        stepLimit: 10,
        allocatedTokens: 100,
      });
      mockDb.client.document.findFirst.mockResolvedValue({
        id: 'doc-1',
        workspaceId: 'ws-123',
      });

      await expect(
        syscallService.executeSyscall('ws-123', 'proc-1', 'tool_exec', {
          sourceDocumentId: 'doc-1',
          toolScript: 'result = require("fs");',
        }),
      ).rejects.toThrow(/require is not defined/);
    });

    it('should block execution if sourceDocumentId is missing or belongs to another workspace', async () => {
      mockDb.client.kernelProcess.findFirst.mockResolvedValue({
        id: 'proc-1',
        workspaceId: 'ws-123',
        status: 'RUNNING',
        stepLimit: 10,
        allocatedTokens: 100,
      });
      // Mock document not found (cross-tenant simulation or missing)
      mockDb.client.document.findFirst.mockResolvedValue(null);

      await expect(
        syscallService.executeSyscall('ws-123', 'proc-1', 'tool_exec', {
          sourceDocumentId: 'doc-cross-tenant',
          toolScript: 'result = "hack";',
        }),
      ).rejects.toThrow(/Execution Veto/);
    });
  });
});
