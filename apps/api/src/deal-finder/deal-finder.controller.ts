import { Controller, UseGuards, Post, Param, Body } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { DealFinderService } from './deal-finder.service';

@Controller('workspaces/:workspaceId/deal-finder')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class DealFinderController {
  constructor(private readonly dealFinderService: DealFinderService) {}

  @Post('search')
  async searchDeals(
    @Param('workspaceId') workspaceId: string,
    @Body() body: { investorProfileId?: string },
  ) {
    return this.dealFinderService.searchDeals(
      workspaceId,
      body.investorProfileId,
    );
  }
}
