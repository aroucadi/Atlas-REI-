import {
  Controller,
  UseGuards,
  Post,
  Get,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { AgentKernelService } from './agent-kernel.service';
import { SyscallHandlerService } from './syscall-handler.service';

@Controller('workspaces/:workspaceId/agent-kernel')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class AgentKernelController {
  constructor(
    private readonly kernelService: AgentKernelService,
    private readonly syscallService: SyscallHandlerService,
  ) {}

  @Post('processes')
  async createProcess(
    @Param('workspaceId') workspaceId: string,
    @Body('goalId') goalId: string,
    @Body('priority') priority: number,
  ) {
    if (!goalId) {
      throw new BadRequestException('goalId is required.');
    }
    return this.kernelService.createProcess(workspaceId, goalId, priority);
  }

  @Post('processes/:processId/start')
  async startProcess(
    @Param('workspaceId') workspaceId: string,
    @Param('processId') processId: string,
  ) {
    return this.kernelService.startProcess(workspaceId, processId);
  }

  @Post('processes/:processId/preempt')
  async preemptProcess(
    @Param('workspaceId') workspaceId: string,
    @Param('processId') processId: string,
  ) {
    return this.kernelService.preemptProcess(workspaceId, processId);
  }

  @Get('processes/next')
  async getNextProcess(@Param('workspaceId') workspaceId: string) {
    return this.kernelService.getNextReadyProcess(workspaceId);
  }

  @Post('processes/:processId/syscall')
  async executeSyscall(
    @Param('workspaceId') workspaceId: string,
    @Param('processId') processId: string,
    @Body('callType')
    callType: 'db_read' | 'db_write' | 'llm_call' | 'tool_exec',
    @Body('payload') payload: any,
  ) {
    if (!callType) {
      throw new BadRequestException('callType is required for system calls.');
    }
    return this.syscallService.executeSyscall(
      workspaceId,
      processId,
      callType,
      payload,
    );
  }
}
