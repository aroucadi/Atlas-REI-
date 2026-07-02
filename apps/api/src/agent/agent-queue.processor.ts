import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, forwardRef, OnModuleDestroy } from '@nestjs/common';
import { Job } from 'bullmq';
import { DatabaseService } from '../database/database.service';
import { AgentService } from './agent.service';

@Processor('agent-queue')
export class AgentQueueProcessor extends WorkerHost implements OnModuleDestroy {
  constructor(
    private readonly db: DatabaseService,
    @Inject(forwardRef(() => AgentService))
    private readonly agentService: AgentService,
  ) {
    super();
  }

  async onModuleDestroy() {
    if (this.worker) {
      await this.worker.close();
    }
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { jobId, workspaceId, propertyId, investorProfileId, reactState } =
      job.data;

    // Upsert AgentTask in db
    await this.db.client.agentTask.upsert({
      where: { jobId },
      update: { status: 'RUNNING' },
      create: {
        jobId,
        status: 'RUNNING',
        logs: [`Job started by worker. Name: ${job.name}`],
      },
    });

    try {
      if (job.name === 'investment_memo') {
        await this.agentService.processMemoBackground(
          jobId,
          workspaceId,
          propertyId,
          reactState,
        );
      } else if (job.name === 'screening') {
        await this.agentService.processScreeningBackground(
          jobId,
          workspaceId,
          propertyId,
          investorProfileId,
          reactState,
        );
      } else if (job.name === 'diligence_and_memo') {
        await this.agentService.processDiligenceAndMemoBackground(
          jobId,
          workspaceId,
          propertyId,
          investorProfileId,
          reactState,
        );
      } else {
        throw new Error(`Unknown job name: ${job.name}`);
      }

      // Read final status from the main Job
      const dbJob = await this.db.client.job.findUnique({
        where: { id: jobId },
      });

      const logs: string[] = [];
      if (dbJob?.resultRefJson) {
        const resultRef = dbJob.resultRefJson as any;
        if (resultRef.runLogs) {
          logs.push(
            ...resultRef.runLogs.map(
              (l: any) => `[${l.timestamp}] ${l.message}`,
            ),
          );
        }
        if (resultRef.stepTrace) {
          logs.push(...resultRef.stepTrace.map((t: string) => `[Trace] ${t}`));
        }
      }

      await this.db.client.agentTask.update({
        where: { jobId },
        data: {
          status: dbJob?.status.toUpperCase() || 'COMPLETED',
          logs: logs.length > 0 ? logs : [`Job completed successfully`],
        },
      });
    } catch (err: any) {
      const dbJob = await this.db.client.job.findUnique({
        where: { id: jobId },
      });

      const logs: string[] = [];
      if (dbJob?.resultRefJson) {
        const resultRef = dbJob.resultRefJson as any;
        if (resultRef.runLogs) {
          logs.push(
            ...resultRef.runLogs.map(
              (l: any) => `[${l.timestamp}] ${l.message}`,
            ),
          );
        }
      }
      logs.push(`Worker error: ${err.message}`);

      await this.db.client.agentTask.update({
        where: { jobId },
        data: {
          status: 'FAILED',
          logs,
        },
      });

      throw err;
    }
  }
}
