import {
  Controller,
  UseGuards,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { ContinuousExecutionService } from './continuous-execution.service';

@Controller('workspaces/:workspaceId/agent-kernel/processes/:processId')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class HumanEscalationController {
  constructor(
    private readonly continuousExecutionService: ContinuousExecutionService,
  ) {}

  @Post('override')
  async overrideProcess(
    @Param('workspaceId') workspaceId: string,
    @Param('processId') processId: string,
  ) {
    // Continue execution cycle after a manual override/authorization
    return this.continuousExecutionService.executeCycle(
      workspaceId,
      processId,
      {
        action: 'override',
      },
    );
  }

  @Post('adjust')
  async adjustProcess(
    @Param('workspaceId') workspaceId: string,
    @Param('processId') processId: string,
    @Body('constraints') constraints: any,
  ) {
    if (!constraints) {
      throw new BadRequestException('Constraints are required for adjustment.');
    }
    // Continue execution cycle with adjusted mandate constraints
    return this.continuousExecutionService.executeCycle(
      workspaceId,
      processId,
      {
        action: 'adjust',
        constraints,
      },
    );
  }

  @Post('abort')
  async abortProcess(
    @Param('workspaceId') workspaceId: string,
    @Param('processId') processId: string,
  ) {
    // Abort the process execution cycle
    return this.continuousExecutionService.executeCycle(
      workspaceId,
      processId,
      {
        action: 'abort',
      },
    );
  }
}
