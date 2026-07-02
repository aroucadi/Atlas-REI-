import { Controller, UseGuards, Get, Post, Param } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { DailyBriefService } from './daily-brief.service';

@Controller('workspaces/:workspaceId/daily-brief')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class DailyBriefController {
  constructor(private readonly briefService: DailyBriefService) {}

  @Get()
  async getDailyBrief(@Param('workspaceId') workspaceId: string) {
    return this.briefService.getDailyBrief(workspaceId);
  }

  @Post('generate')
  async generateDailyBrief(@Param('workspaceId') workspaceId: string) {
    return this.briefService.generateDailyBrief(workspaceId);
  }
}
