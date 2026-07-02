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
import { AgentMessageBrokerService } from './agent-message-broker.service';
import { ConsensusCoordinatorService } from './consensus-coordinator.service';

@Controller('workspaces/:workspaceId/agent-messages')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class AgentMessagesController {
  constructor(
    private readonly messageBroker: AgentMessageBrokerService,
    private readonly consensusService: ConsensusCoordinatorService,
  ) {}

  @Get('goals/:goalId')
  async getGoalMessages(
    @Param('workspaceId') workspaceId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.messageBroker.getGoalMessages(workspaceId, goalId);
  }

  @Post('negotiate')
  async runNegotiation(
    @Param('workspaceId') workspaceId: string,
    @Body('goalId') goalId: string,
    @Body('propertyId') propertyId: string,
    @Body('initialYield') initialYield: number,
  ) {
    if (!goalId || !propertyId || initialYield === undefined) {
      throw new BadRequestException(
        'goalId, propertyId, and initialYield are required.',
      );
    }
    return this.consensusService.runNegotiation(
      workspaceId,
      goalId,
      propertyId,
      initialYield,
    );
  }
}
