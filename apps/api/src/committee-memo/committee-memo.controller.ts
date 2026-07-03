import { Controller, Get, Post, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { CommitteeMemoService } from './committee-memo.service';
import { CurrentUser } from '../auth/current-user.decorator';

@Controller('workspaces/:workspaceId/properties/:propertyId/committee-memo')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class CommitteeMemoController {
  constructor(private readonly memoService: CommitteeMemoService) {}

  @Get()
  async getCommitteeMemo(
    @Param('workspaceId') workspaceId: string,
    @Param('propertyId') propertyId: string,
    @Query('regenerate') regenerate: string | undefined,
    @CurrentUser() user: any,
  ) {
    return this.memoService.getOrGenerate({
      workspaceId,
      propertyId,
      requestedByUserId: user.id,
      forceRegenerate: regenerate === 'true',
    });
  }

  @Post('sign-off')
  async signOff(
    @Param('workspaceId') workspaceId: string,
    @Param('propertyId') propertyId: string,
    @CurrentUser() user: any,
  ) {
    return this.memoService.signOff(workspaceId, propertyId, user.id);
  }
}
