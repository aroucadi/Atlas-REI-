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
import { CommitteeService } from './committee.service';
import { CurrentUser } from '../auth/current-user.decorator';
import { CommitteeEvaluateRequestSchema } from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/committee')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class CommitteeController {
  constructor(private readonly committeeService: CommitteeService) {}

  @Post('evaluate')
  async evaluate(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const parsed = CommitteeEvaluateRequestSchema.safeParse({
      ...body,
      workspaceId,
    });

    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }

    return this.committeeService.evaluateDeal(
      user.id,
      workspaceId,
      parsed.data.investorProfileId,
      parsed.data.underwriteRunId,
    );
  }

  @Get('runs/:runId')
  async getRun(
    @Param('workspaceId') workspaceId: string,
    @Param('runId') runId: string,
  ) {
    return this.committeeService.getDecision(workspaceId, runId);
  }
}
