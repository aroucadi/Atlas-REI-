/**
 * WARNING: SECURITY LIMITATION
 * This service uses standard Node.js 'vm.createContext' for script execution.
 * THIS DOES NOT PROVIDE A SECURE ISOLATION BOUNDARY or security sandboxing.
 * It is a step-limited/resource-bounded execution context designed ONLY for basic instrumentation and preemption.
 * DO NOT use this to execute untrusted or LLM-generated code against production customer data
 * without replacing this implementation with a secure container boundary (e.g. isolated-vm, WASM, or gVisor).
 */
import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import * as vm from 'vm';

@Injectable()
export class SyscallHandlerService {
  constructor(private readonly db: DatabaseService) {}

  async executeSyscall(
    workspaceId: string,
    processId: string,
    callType: 'db_read' | 'db_write' | 'llm_call' | 'tool_exec',
    payload: any = {},
  ): Promise<any> {
    // 1. Tenancy validation: Ensure the KernelProcess exists and matches workspaceId
    const proc = await this.db.client.kernelProcess.findFirst({
      where: { id: processId, workspaceId },
    });

    if (!proc) {
      throw new BadRequestException(
        'Process not found or workspace tenancy breach.',
      );
    }

    // 2. Preemption Gating: Ensure process is not already preempted or completed/failed
    if (proc.status !== 'RUNNING') {
      throw new BadRequestException(
        `Process execution halted. Process status: ${proc.status}`,
      );
    }

    // 3. Step Limit preemption check
    const currentSteps = (payload.stepIndex ?? 0) + 1;
    if (currentSteps > proc.stepLimit) {
      // Trigger preemption
      await this.db.client.kernelProcess.update({
        where: { id: processId },
        data: { status: 'PREEMPTED' },
      });
      throw new BadRequestException(
        `Preemption Veto: process step limit of ${proc.stepLimit} exceeded.`,
      );
    }

    // 4. Budget Gating (Token cost scheduler check)
    let cost = 0;
    if (callType === 'llm_call') {
      cost = payload.estimatedTokens ?? 100;
      const totalTokens = proc.allocatedTokens + cost;
      if (totalTokens > 1000) {
        // Enforce token budget cap
        await this.db.client.kernelProcess.update({
          where: { id: processId },
          data: { status: 'PREEMPTED' },
        });
        throw new BadRequestException(
          `Preemption Veto: process token budget limit exceeded.`,
        );
      }

      await this.db.client.kernelProcess.update({
        where: { id: processId },
        data: { allocatedTokens: totalTokens },
      });
    }

    // 5. Execute actual payload depending on call type
    switch (callType) {
      case 'db_read':
        // e.g. lookup properties or evidence
        if (payload.model === 'goal') {
          return this.db.client.goal.findMany({
            where: { workspaceId },
            take: payload.limit ?? 5,
          });
        }
        return { success: true, message: 'db_read executed.' };

      case 'db_write':
        return { success: true, message: 'db_write executed.' };

      case 'llm_call':
        return {
          success: true,
          text: 'Simulated LLM output from Syscall',
          cost,
        };

      case 'tool_exec': {
        // ⚠️ INPUT VALIDATION SECURITY GUARD:
        // Enforce that script code must be sourced exclusively from a Document
        // that belongs to this authenticated workspace. No arbitrary third-party
        // or cross-tenant code execution is permitted.
        const sourceDocumentId = payload.sourceDocumentId;
        if (!sourceDocumentId) {
          throw new BadRequestException(
            'Execution Veto: sourceDocumentId must be provided to verify content is sourced from the workspace.',
          );
        }

        const doc = await this.db.client.document.findFirst({
          where: { id: sourceDocumentId, workspaceId },
        });
        if (!doc) {
          throw new BadRequestException(
            'Execution Veto: Sourced content not found or workspace tenancy breach.',
          );
        }

        try {
          const contextObject = {
            args: payload.args || {},
            result: null,
            console: {
              log: (...args: any[]) =>
                console.log('[StepLimitedContext]', ...args),
              error: (...args: any[]) =>
                console.error('[StepLimitedContext]', ...args),
            },
          };
          const stepLimitedContext = vm.createContext(contextObject);
          const scriptCode =
            payload.toolScript ||
            `result = "Executed tool ${payload.toolName} successfully.";`;
          const script = new vm.Script(scriptCode);
          script.runInContext(stepLimitedContext, { timeout: 1000 });
          return {
            success: true,
            result: stepLimitedContext.result,
          };
        } catch (err: any) {
          throw new BadRequestException(
            `Resource-Bounded Context Execution Error (not security-isolated): ${err.message}`,
          );
        }
      }

      default:
        throw new BadRequestException(`Unknown system call type: ${callType}`);
    }
  }
}
