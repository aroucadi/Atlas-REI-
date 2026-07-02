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
import { InstitutionalOutcomeAnalyzerService } from './institutional-outcome-analyzer.service';
import { CrossGoalPatternExtractorService } from './cross-goal-pattern-extractor.service';
import { SecureAnonymizerService } from './secure-anonymizer.service';

@Controller('workspaces/:workspaceId/org-intel')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class OrganizationalIntelligenceController {
  constructor(
    private readonly outcomeService: InstitutionalOutcomeAnalyzerService,
    private readonly extractorService: CrossGoalPatternExtractorService,
    private readonly anonymizerService: SecureAnonymizerService,
  ) {}

  @Post('analyze-drift')
  async analyzeDrift(
    @Param('workspaceId') workspaceId: string,
    @Body('propertyId') propertyId: string,
  ) {
    if (!propertyId) {
      throw new BadRequestException('propertyId is required.');
    }
    return this.outcomeService.analyzeDrifts(workspaceId, propertyId);
  }

  @Get('patterns')
  async getPatterns(@Param('workspaceId') workspaceId: string) {
    return this.extractorService.extractPatterns(workspaceId);
  }

  @Post('anonymize')
  async anonymizeLogs(@Body('logs') logs: string[]) {
    if (!logs || !Array.isArray(logs)) {
      throw new BadRequestException('Logs array is required.');
    }
    return {
      anonymizedDataset: this.anonymizerService.convertToTrainingFormat(logs),
    };
  }
}
