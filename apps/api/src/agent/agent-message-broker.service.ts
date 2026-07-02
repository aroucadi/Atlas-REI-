import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AgentMessageBrokerService {
  constructor(private readonly db: DatabaseService) {}

  async sendMessage(
    workspaceId: string,
    goalId: string,
    sender: string,
    recipient: string,
    performative: string,
    content: any = {},
  ) {
    // 1. Tenancy validation: Ensure Goal exists and belongs to the workspace
    const goal = await this.db.client.goal.findFirst({
      where: { id: goalId, workspaceId },
    });

    if (!goal) {
      throw new BadRequestException('Goal not found in this workspace.');
    }

    // 2. Persist the message to the database
    return this.db.client.agentMessage.create({
      data: {
        workspaceId,
        goalId,
        sender,
        recipient,
        performative,
        content: content || {},
      },
    });
  }

  async getGoalMessages(workspaceId: string, goalId: string) {
    // Tenancy check
    const goal = await this.db.client.goal.findFirst({
      where: { id: goalId, workspaceId },
    });

    if (!goal) {
      throw new BadRequestException('Goal not found in this workspace.');
    }

    return this.db.client.agentMessage.findMany({
      where: { goalId, workspaceId },
      orderBy: { createdAt: 'asc' },
    });
  }
}
