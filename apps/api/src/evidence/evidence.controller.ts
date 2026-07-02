import { Controller, UseGuards, Get, Param, Query } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { EvidenceService } from './evidence.service';

@Controller('workspaces/:workspaceId/evidence')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class EvidenceController {
  constructor(private readonly evidenceService: EvidenceService) {}

  @Get()
  async getEvidence(
    @Param('workspaceId') workspaceId: string,
    @Query('propertyId') propertyId?: string,
  ) {
    return this.evidenceService.getEvidenceForWorkspace(
      workspaceId,
      propertyId,
    );
  }
}
