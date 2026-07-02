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
import { KnowledgeGraphService } from './knowledge-graph.service';

@Controller('workspaces/:workspaceId/knowledge-graph')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class KnowledgeGraphController {
  constructor(private readonly kgService: KnowledgeGraphService) {}

  @Post('ingest')
  async ingest(
    @Param('workspaceId') workspaceId: string,
    @Body('text') text: string,
  ) {
    if (!text) {
      throw new BadRequestException('Text is required for ingestion.');
    }
    return this.kgService.ingestText(workspaceId, text);
  }

  @Get('nodes/:nodeId/neighbors')
  async getNeighbors(
    @Param('workspaceId') workspaceId: string,
    @Param('nodeId') nodeId: string,
  ) {
    return this.kgService.getNeighbors(workspaceId, nodeId);
  }

  @Post('consolidate')
  async consolidate(
    @Param('workspaceId') workspaceId: string,
    @Body('type') type: string,
  ) {
    if (!type) {
      throw new BadRequestException('Type is required for consolidation.');
    }
    return this.kgService.consolidateDuplicates(workspaceId, type);
  }
}
