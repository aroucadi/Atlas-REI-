import { Injectable, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class AgentKernelService {
  constructor(private readonly db: DatabaseService) {}

  async createProcess(
    workspaceId: string,
    goalId: string,
    priority: number = 5,
  ) {
    // Verify goal exists
    const goal = await this.db.client.goal.findFirst({
      where: { id: goalId, workspaceId },
    });
    if (!goal) {
      throw new BadRequestException('Goal not found.');
    }

    return this.db.client.kernelProcess.create({
      data: {
        workspaceId,
        goalId,
        priority,
        status: 'READY',
      },
    });
  }

  async startProcess(workspaceId: string, processId: string) {
    const proc = await this.db.client.kernelProcess.findFirst({
      where: { id: processId, workspaceId },
    });
    if (!proc) {
      throw new BadRequestException('Process not found.');
    }

    return this.db.client.kernelProcess.update({
      where: { id: processId },
      data: { status: 'RUNNING' },
    });
  }

  async preemptProcess(workspaceId: string, processId: string) {
    return this.db.client.kernelProcess.updateMany({
      where: { id: processId, workspaceId },
      data: { status: 'PREEMPTED' },
    });
  }

  async completeProcess(workspaceId: string, processId: string) {
    return this.db.client.kernelProcess.updateMany({
      where: { id: processId, workspaceId },
      data: { status: 'COMPLETED' },
    });
  }

  async getNextReadyProcess(workspaceId: string) {
    // Schedules process based on priority (highest priority first) and FIFO for creation order
    return this.db.client.kernelProcess.findFirst({
      where: { workspaceId, status: 'READY' },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });
  }
}
