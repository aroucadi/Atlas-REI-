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
import { AgentService } from './agent.service';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  CreateMemoJobRequestSchema,
  CreateWorkflowJobRequestSchema,
  TogglePolicyRequestSchema,
} from '@atlas/shared-types';

@Controller('workspaces/:workspaceId')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Get('jobs')
  async listJobs(@Param('workspaceId') workspaceId: string) {
    return this.agentService.getJobs(workspaceId);
  }

  @Get('jobs/:jobId')
  async getJob(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.agentService.getJob(workspaceId, jobId);
  }

  @Post('agents/memo/generate')
  async generateMemo(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const parsed = CreateMemoJobRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.agentService.triggerMemoJob(
      workspaceId,
      user.id,
      parsed.data.propertyId,
    );
  }

  @Post('jobs/:jobId/approve')
  async approve(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.agentService.approveMemo(workspaceId, jobId);
  }

  @Post('jobs/:jobId/reject')
  async reject(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.agentService.rejectMemo(workspaceId, jobId);
  }

  @Post('agents/workflow/trigger')
  async triggerWorkflow(
    @Param('workspaceId') workspaceId: string,
    @CurrentUser() user: any,
    @Body() body: any,
  ) {
    const parsed = CreateWorkflowJobRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.agentService.triggerWorkflowJob(
      workspaceId,
      user.id,
      parsed.data.propertyId,
      parsed.data.investorProfileId,
    );
  }

  @Post('jobs/:jobId/approve-screening')
  async approveScreening(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.agentService.approveScreening(workspaceId, jobId);
  }

  @Post('jobs/:jobId/reject-screening')
  async rejectScreening(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.agentService.rejectScreening(workspaceId, jobId);
  }

  @Post('jobs/:jobId/approve-memo')
  async approveWorkflowMemo(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.agentService.approveWorkflowMemo(workspaceId, jobId);
  }

  @Post('jobs/:jobId/reject-memo')
  async rejectWorkflowMemo(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
  ) {
    return this.agentService.rejectWorkflowMemo(workspaceId, jobId);
  }

  @Post('jobs/:jobId/approve-action')
  async approveAction(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
    @Body('toolName') toolName: string,
  ) {
    return this.agentService.approveAction(workspaceId, jobId, toolName);
  }

  @Post('jobs/:jobId/reject-action')
  async rejectAction(
    @Param('workspaceId') workspaceId: string,
    @Param('jobId') jobId: string,
    @Body('toolName') toolName: string,
  ) {
    return this.agentService.rejectAction(workspaceId, jobId, toolName);
  }

  @Get('agents/analytics')
  async getAnalytics(@Param('workspaceId') workspaceId: string) {
    return this.agentService.getAgentAnalytics(workspaceId);
  }

  @Get('agents/definitions')
  async getDefinitions() {
    return this.agentService.getAgentDefinitions();
  }

  @Get('agents/tools')
  async getTools() {
    return this.agentService.getToolDefinitions();
  }

  @Post('agents/policy/toggle')
  async togglePolicy(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
  ) {
    const parsed = TogglePolicyRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.agentService.togglePolicy(workspaceId, parsed.data);
  }
}
