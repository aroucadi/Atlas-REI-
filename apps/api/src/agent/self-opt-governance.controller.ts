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
import { PromptOptimizerService } from './prompt-optimizer.service';

@Controller('workspaces/:workspaceId/self-opt')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class SelfOptGovernanceController {
  constructor(private readonly optimizerService: PromptOptimizerService) {}

  @Get('proposals')
  async listPending(@Param('workspaceId') workspaceId: string) {
    return this.optimizerService.listPending(workspaceId);
  }

  @Post('proposals/:proposalId/approve')
  async approve(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.optimizerService.approveProposal(workspaceId, proposalId);
  }

  @Post('proposals/:proposalId/reject')
  async reject(
    @Param('workspaceId') workspaceId: string,
    @Param('proposalId') proposalId: string,
  ) {
    return this.optimizerService.rejectProposal(workspaceId, proposalId);
  }

  @Post('proposals/trigger')
  async triggerOptimization(
    @Param('workspaceId') workspaceId: string,
    @Body('targetArea') targetArea: string,
    @Body('originalConfig') originalConfig: any,
    @Body('failureReason') failureReason: string,
    @Body('testSuiteId') testSuiteId?: string,
  ) {
    if (!targetArea || !originalConfig || !failureReason) {
      throw new BadRequestException(
        'targetArea, originalConfig, and failureReason are required.',
      );
    }
    return this.optimizerService.proposeOptimization(
      workspaceId,
      targetArea,
      originalConfig,
      failureReason,
      testSuiteId,
    );
  }
}
