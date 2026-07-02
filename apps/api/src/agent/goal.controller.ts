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
import { GoalService } from './goal.service';

@Controller('workspaces/:workspaceId/goals')
@UseGuards(JwtAuthGuard, WorkspaceMembershipGuard)
export class GoalController {
  constructor(private readonly goalService: GoalService) {}

  @Post()
  async compileGoal(
    @Param('workspaceId') workspaceId: string,
    @Body('goalText') goalText: string,
  ) {
    if (!goalText) {
      throw new BadRequestException('goalText is required');
    }
    return this.goalService.compileGoal(workspaceId, goalText);
  }

  @Get(':goalId')
  async getGoal(
    @Param('workspaceId') workspaceId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.goalService.getGoalDetails(workspaceId, goalId);
  }

  @Post(':goalId/objectives/:objectiveId/status')
  async updateObjectiveStatus(
    @Param('workspaceId') workspaceId: string,
    @Param('goalId') goalId: string,
    @Param('objectiveId') objectiveId: string,
    @Body('status') status: 'COMPLETED' | 'FAILED' | 'RUNNING',
  ) {
    if (!status) {
      throw new BadRequestException('status is required');
    }
    return this.goalService.updateObjectiveStatus(
      workspaceId,
      goalId,
      objectiveId,
      status,
    );
  }
}
