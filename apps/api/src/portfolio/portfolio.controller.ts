import {
  Controller,
  UseGuards,
  Get,
  Post,
  Param,
  Body,
  BadRequestException,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceMembershipGuard } from '../auth/workspace-membership.guard';
import { PortfolioService } from './portfolio.service';
import {
  CreatePortfolioSchema,
  AddPortfolioPositionSchema,
} from '@atlas/shared-types';

@Controller('workspaces/:workspaceId/portfolios')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class PortfolioController {
  constructor(private readonly portfolioService: PortfolioService) {}

  @Get()
  async getPortfolios(@Param('workspaceId') workspaceId: string) {
    return this.portfolioService.getPortfolios(workspaceId);
  }

  @Post()
  async createPortfolio(
    @Param('workspaceId') workspaceId: string,
    @Body() body: any,
  ) {
    const parsed = CreatePortfolioSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.portfolioService.createPortfolio(workspaceId, parsed.data);
  }

  @Get(':portfolioId/positions')
  async getPositions(
    @Param('workspaceId') workspaceId: string,
    @Param('portfolioId') portfolioId: string,
  ) {
    return this.portfolioService.getPositions(workspaceId, portfolioId);
  }

  @Post(':portfolioId/positions')
  async addPosition(
    @Param('workspaceId') workspaceId: string,
    @Param('portfolioId') portfolioId: string,
    @Body() body: any,
  ) {
    const parsed = AddPortfolioPositionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.errors);
    }
    return this.portfolioService.addPosition(
      workspaceId,
      portfolioId,
      parsed.data,
    );
  }
}
