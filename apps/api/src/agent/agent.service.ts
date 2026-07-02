import {
  Injectable,
  BadRequestException,
  NotFoundException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';
import {
  AgentMemoResultSchema,
  AgentScreeningResultSchema,
  AgentDiligenceResultSchema,
  AgentAnalyticsResponse,
  TogglePolicyRequest,
} from '@atlas/shared-types';
import {
  AgentRegistry,
  ToolRegistry,
  AgentRuntimeCore,
  RunContext,
  ReActExecutionEngine,
} from './runtime';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { EmbeddingService } from '../document/embedding.service';

import { PromptRegistryService } from './prompt-registry.service';

@Injectable()
export class AgentService implements OnModuleInit, OnModuleDestroy {
  private readonly aiGateway: AiGateway;

  constructor(
    private readonly db: DatabaseService,
    @InjectQueue('agent-queue') private readonly agentQueue: Queue,
    private readonly embeddingService: EmbeddingService,
    private readonly promptRegistry: PromptRegistryService,
  ) {
    this.aiGateway = new AiGateway();
    this.registerAgentsAndTools();
  }

  async onModuleInit() {
    const result = await this.db.client.job.updateMany({
      where: {
        status: {
          in: ['queued', 'running'],
        },
      },
      data: {
        status: 'failed',
        errorMessage: 'Server restarted. Job aborted.',
      },
    });
    console.log(
      `[Self-Healing Background Scheduler] Gracefully failed ${result.count} dangling background jobs.`,
    );
  }

  async onModuleDestroy() {
    await this.agentQueue.close();
  }

  private registerAgentsAndTools() {
    AgentRegistry.clear();
    ToolRegistry.clear();

    ToolRegistry.register({
      name: 'fetch_property_data',
      description: 'Fetch property details from the database',
      version: '1.0.0',
      handler: async (args: { propertyId: string }, context) => {
        return context.db.client.property.findUnique({
          where: { id: args.propertyId },
          include: { building: true, city: true },
        });
      },
    });

    ToolRegistry.register({
      name: 'fetch_underwrite_data',
      description: 'Fetch latest underwriting run assumptions and metrics',
      version: '1.0.0',
      handler: async (args: { propertyId: string }, context) => {
        return context.db.client.underwriteRun.findFirst({
          where: {
            workspaceId: context.workspaceId,
            propertyId: args.propertyId,
          },
          orderBy: { createdAt: 'desc' },
        });
      },
    });

    ToolRegistry.register({
      name: 'fetch_decision_data',
      description: 'Fetch latest committee decision',
      version: '1.0.0',
      handler: async (args: { propertyId: string }, context) => {
        return context.db.client.investmentDecision.findFirst({
          where: {
            workspaceId: context.workspaceId,
            entityId: args.propertyId,
          },
          orderBy: { createdAt: 'desc' },
        });
      },
    });

    ToolRegistry.register({
      name: 'fetch_evidence_records',
      description: 'Fetch evidence records from comps and lease ledger',
      version: '1.0.0',
      handler: async (args: { propertyId: string }, context) => {
        const conventional = await context.db.client.evidence.findMany({
          where: {
            workspaceId: context.workspaceId,
            propertyId: args.propertyId,
          },
          take: 10,
        });

        try {
          const semanticChunks = await this.embeddingService.semanticSearch(
            context.workspaceId,
            `lease agreement rent escalation terms due diligence for property ${args.propertyId}`,
            5,
          );

          const mappedChunks = semanticChunks.map((chunk) => ({
            id: chunk.id,
            workspaceId: context.workspaceId,
            propertyId: args.propertyId,
            sourceType: 'document_chunk',
            sourceId: chunk.documentId,
            title: `Semantic Chunk: ${chunk.fileName} (Page ${chunk.pageNumber})`,
            snippet: chunk.content,
            confidence: chunk.score,
            freshness: new Date(),
          }));

          return [...conventional, ...mappedChunks];
        } catch (err: any) {
          console.warn(
            '[fetch_evidence_records] Semantic search failed, using conventional only',
            err.message,
          );
          return conventional;
        }
      },
    });

    ToolRegistry.register({
      name: 'fetch_profile_data',
      description: 'Fetch active investor profile guidelines',
      version: '1.0.0',
      handler: async (args: { investorProfileId?: string }, context) => {
        if (args.investorProfileId) {
          return context.db.client.investorProfile.findUnique({
            where: { id: args.investorProfileId },
          });
        }
        return context.db.client.investorProfile.findFirst({
          where: { workspaceId: context.workspaceId },
          orderBy: { createdAt: 'desc' },
        });
      },
    });

    ToolRegistry.register({
      name: 'generate_memo_text',
      description: 'Calls AI Gateway to generate investment memo text',
      version: '1.0.0',
      handler: async (
        args: { prompt: string; systemInstruction: string },
        context,
      ) => {
        return context.aiGateway.generateStructuredJson<any>(
          args.prompt,
          AgentMemoResultSchema,
          args.systemInstruction,
        );
      },
    });

    ToolRegistry.register({
      name: 'generate_screening_result',
      description: 'Calls AI Gateway to generate screening score and verdict',
      version: '1.0.0',
      handler: async (
        args: { prompt: string; systemInstruction: string },
        context,
      ) => {
        return context.aiGateway.generateStructuredJson<any>(
          args.prompt,
          AgentScreeningResultSchema,
          args.systemInstruction,
        );
      },
    });

    ToolRegistry.register({
      name: 'generate_diligence_result',
      description: 'Calls AI Gateway to generate diligence findings and risks',
      version: '1.0.0',
      handler: async (
        args: { prompt: string; systemInstruction: string },
        context,
      ) => {
        return context.aiGateway.generateStructuredJson<any>(
          args.prompt,
          AgentDiligenceResultSchema,
          args.systemInstruction,
        );
      },
    });

    ToolRegistry.register({
      name: 'submit_investment_decision',
      description: 'Submit the final investment decision to the committee',
      version: '1.0.0',
      handler: async (
        args: { propertyId: string; decision: string },
        context,
      ) => {
        if (context) {
          /* ignore */
        }
        return {
          success: true,
          message: `Investment decision "${args.decision}" submitted for property ${args.propertyId}.`,
        };
      },
    });

    ToolRegistry.register({
      name: 'dispatch_notification',
      description: 'Dispatches notifications to workspace members',
      version: '1.0.0',
      handler: async (args: { channel: string; message: string }, context) => {
        if (context) {
          /* ignore */
        }
        return {
          success: true,
          message: `Notification sent via ${args.channel}: ${args.message}`,
        };
      },
    });

    AgentRegistry.register({
      id: 'single_memo_agent',
      name: 'Single Investment Memo Agent',
      description: 'Generates comprehensive investment memo in one pass',
      version: '1.0.0',
      requiredTools: [
        'fetch_property_data',
        'fetch_underwrite_data',
        'fetch_decision_data',
        'fetch_evidence_records',
        'fetch_profile_data',
        'generate_memo_text',
      ],
      policies: ['tool_permissions', 'env_restrictions', 'approvals'],
      systemInstruction: 'Lead Memo Agent instructions',
    });

    AgentRegistry.register({
      id: 'screening_agent',
      name: 'Workflow Screening Agent',
      description: 'Performs initial deal fit screening',
      version: '1.0.0',
      requiredTools: [
        'fetch_property_data',
        'fetch_profile_data',
        'fetch_underwrite_data',
        'generate_screening_result',
      ],
      policies: ['tool_permissions', 'env_restrictions', 'approvals'],
      systemInstruction: 'Screening Agent instructions',
    });

    AgentRegistry.register({
      id: 'diligence_agent',
      name: 'Workflow Diligence Agent',
      description: 'Performs lease and risk verification',
      version: '1.0.0',
      requiredTools: [
        'fetch_evidence_records',
        'generate_diligence_result',
        'fetch_property_data',
        'fetch_underwrite_data',
      ],
      policies: ['tool_permissions', 'env_restrictions'],
      systemInstruction: 'Diligence Agent instructions',
    });

    AgentRegistry.register({
      id: 'memo_agent',
      name: 'Workflow Memo Compiler Agent',
      description: 'Compiles final workflow memo',
      version: '1.0.0',
      requiredTools: [
        'fetch_property_data',
        'fetch_profile_data',
        'fetch_underwrite_data',
        'generate_memo_text',
      ],
      policies: ['tool_permissions', 'env_restrictions', 'approvals'],
      systemInstruction: 'Memo Compiler Agent instructions',
    });
  }

  async getJobs(workspaceId: string) {
    return this.db.client.job.findMany({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getJob(workspaceId: string, jobId: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found in workspace`);
    }
    return job;
  }

  async triggerMemoJob(
    workspaceId: string,
    userId: string,
    propertyId: string,
  ) {
    // 1. Check if property exists
    const property = await this.db.client.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new BadRequestException(`Property ID ${propertyId} not found`);
    }

    // 2. Create job in "queued" status
    const job = await this.db.client.job.create({
      data: {
        workspaceId,
        jobType: 'investment_memo',
        status: 'queued',
        progressPct: 0,
        inputJson: { propertyId, userId },
        resultRefJson: {},
      },
    });

    // Create AgentTask record in database
    await this.db.client.agentTask.create({
      data: {
        jobId: job.id,
        status: 'QUEUED',
        logs: ['Job enqueued in BullMQ.'],
      },
    });

    // 3. Enqueue job on BullMQ
    await this.agentQueue.add(
      'investment_memo',
      {
        jobId: job.id,
        workspaceId,
        propertyId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    return job;
  }

  async processMemoBackground(
    jobId: string,
    workspaceId: string,
    propertyId: string,
    reactState?: any,
  ) {
    const runLogs: any[] = [];
    const stepTrace: string[] = [];

    const log = (message: string) => {
      runLogs.push({ timestamp: new Date().toISOString(), message });
    };

    const trace = (step: string) => {
      stepTrace.push(step);
      log(`Trace step: ${step}`);
    };

    try {
      trace('Job initiated');
      await this.db.client.job.update({
        where: { id: jobId },
        data: { status: 'running', progressPct: 10 },
      });

      const context: RunContext = {
        workspaceId,
        propertyId,
        jobId,
        db: this.db,
        aiGateway: this.aiGateway,
        runLogs,
        stepTrace,
      };

      const initialPrompt = `Draft investment memo for property ID: "${propertyId}". Use available tools to gather details and output the final memo text.`;

      const loopResult = await ReActExecutionEngine.run(
        'single_memo_agent',
        context,
        initialPrompt,
        reactState,
      );

      if (loopResult.status === 'suspended') {
        // Paused execution state has been handled internally by the ReActEngine.
        return;
      }

      const answer = loopResult.result?.answer || 'Memo draft completed.';
      const steps = loopResult.result?.steps || [];

      trace('Memo draft finalized. Evaluating gating policy.');

      const profile = await this.db.client.investorProfile.findFirst({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      });
      const config = (profile?.constraintsJson as any) || {};
      const requireMemoApproval = config.requireMemoApproval !== false;

      if (!requireMemoApproval) {
        trace(
          'Memo auto-approved (requireMemoApproval is disabled). Publishing document.',
        );
        await this.db.client.$transaction(async (tx) => {
          const doc = await tx.document.create({
            data: {
              workspaceId,
              entityType: 'property',
              entityId: propertyId || '00000000-0000-0000-0000-000000000000',
              documentType: 'investment_memo',
              fileName: `investment_memo_${jobId.slice(0, 8)}.md`,
              storagePath: `memos/memo-${jobId}.md`,
              mimeType: 'text/markdown',
              status: 'completed',
            },
          });

          await tx.job.update({
            where: { id: jobId },
            data: {
              status: 'completed',
              progressPct: 100,
              resultRefJson: {
                memoText: answer,
                propertyId,
                stepTrace,
                runLogs,
                documentId: doc.id,
                steps,
              },
            },
          });
        });
      } else {
        trace('Memo draft finalized. Awaiting user review.');

        await this.db.client.job.update({
          where: { id: jobId },
          data: {
            status: 'awaiting_approval',
            progressPct: 100,
            resultRefJson: {
              memoText: answer,
              propertyId,
              stepTrace,
              runLogs,
              steps,
            },
          },
        });
      }
    } catch (e: any) {
      console.error(`Background memo agent run failed for job ${jobId}`, e);
      log(`Error encountered: ${e.message || e}`);
      await this.db.client.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          progressPct: 100,
          errorMessage: e.message || 'Background execution failed.',
          resultRefJson: {
            stepTrace,
            runLogs,
          },
        },
      });
    }
  }

  async approveMemo(workspaceId: string, jobId: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'awaiting_approval') {
      throw new BadRequestException(
        `Job is in status ${job.status}, cannot approve`,
      );
    }

    const { propertyId } = job.resultRefJson as any;

    return this.db.client.$transaction(async (tx) => {
      // Create a final Document in the workspace of type "investment_memo"
      const doc = await tx.document.create({
        data: {
          workspaceId,
          entityType: 'property',
          entityId: propertyId || '00000000-0000-0000-0000-000000000000',
          documentType: 'investment_memo',
          fileName: `investment_memo_${jobId.slice(0, 8)}.md`,
          storagePath: `memos/memo-${jobId}.md`,
          mimeType: 'text/markdown',
          status: 'completed',
        },
      });

      const updatedResult = {
        ...(job.resultRefJson as any),
        documentId: doc.id,
      };

      return tx.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          resultRefJson: updatedResult,
        },
      });
    });
  }

  async rejectMemo(workspaceId: string, jobId: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'awaiting_approval') {
      throw new BadRequestException(
        `Job is in status ${job.status}, cannot reject`,
      );
    }

    return this.db.client.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: 'Rejected by user review checkpoint.',
      },
    });
  }

  async triggerWorkflowJob(
    workspaceId: string,
    userId: string,
    propertyId: string,
    investorProfileId: string,
  ) {
    // 1. Check if property exists
    const property = await this.db.client.property.findUnique({
      where: { id: propertyId },
    });
    if (!property) {
      throw new BadRequestException(`Property ID ${propertyId} not found`);
    }

    // 2. Check if investor profile exists
    const profile = await this.db.client.investorProfile.findUnique({
      where: { id: investorProfileId },
    });
    if (!profile || profile.workspaceId !== workspaceId) {
      throw new BadRequestException(
        `Investor Profile ID ${investorProfileId} not found`,
      );
    }

    // 3. Create job of type "multi_agent_workflow" in "queued" status
    const job = await this.db.client.job.create({
      data: {
        workspaceId,
        jobType: 'multi_agent_workflow',
        status: 'queued',
        progressPct: 0,
        inputJson: { propertyId, userId, investorProfileId },
        resultRefJson: {
          propertyId,
          investorProfileId,
          step: 'screening',
          stepTrace: [],
          runLogs: [],
        },
      },
    });

    // Create AgentTask record in database
    await this.db.client.agentTask.create({
      data: {
        jobId: job.id,
        status: 'QUEUED',
        logs: ['Workflow Screening Agent enqueued in BullMQ.'],
      },
    });

    // 4. Enqueue job on BullMQ
    await this.agentQueue.add(
      'screening',
      {
        jobId: job.id,
        workspaceId,
        propertyId,
        investorProfileId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    return job;
  }

  async processScreeningBackground(
    jobId: string,
    workspaceId: string,
    propertyId: string,
    investorProfileId: string,
    reactState?: any,
  ) {
    if (reactState) {
      /* ignore */
    }
    const runLogs: any[] = [];
    const stepTrace: string[] = [];

    const log = (message: string) => {
      runLogs.push({ timestamp: new Date().toISOString(), message });
    };

    const trace = (step: string) => {
      stepTrace.push(step);
      log(`Trace step: ${step}`);
    };

    try {
      trace('Screening Agent initiated');
      await this.db.client.job.update({
        where: { id: jobId },
        data: { status: 'running', progressPct: 10 },
      });

      const context: RunContext = {
        workspaceId,
        propertyId,
        investorProfileId,
        jobId,
        db: this.db,
        aiGateway: this.aiGateway,
        runLogs,
        stepTrace,
      };

      const screeningResult = await AgentRuntimeCore.executeStep<any>(
        'screening_agent',
        'screening',
        context,
        async (ctx) => {
          trace('Querying property and building records');
          const propertyTool = ToolRegistry.get('fetch_property_data')!;
          const property = await propertyTool.handler({ propertyId }, ctx);

          trace('Querying investor profile details');
          const profileTool = ToolRegistry.get('fetch_profile_data')!;
          const profile = await profileTool.handler({ investorProfileId }, ctx);

          trace('Checking underwriting pre-requisites');
          const underwriteTool = ToolRegistry.get('fetch_underwrite_data')!;
          const underwrite = await underwriteTool.handler({ propertyId }, ctx);

          if (!underwrite) {
            trace('Block encountered: Underwriting run is missing');
            log('Error: Active underwriting run is missing for this property.');
            await ctx.db.client.job.update({
              where: { id: jobId },
              data: {
                status: 'blocked',
                progressPct: 20,
                errorMessage:
                  'Missing active underwriting run. Please run underwriting computation first.',
                resultRefJson: {
                  propertyId,
                  investorProfileId,
                  step: 'screening',
                  stepTrace,
                  runLogs,
                },
              },
            });
            throw new Error('Blocked run: Underwriting run is missing.');
          }

          await ctx.db.client.job.update({
            where: { id: jobId },
            data: { progressPct: 15 },
          });

          const systemInstruction =
            await this.promptRegistry.getPrompt('screening_agent');

          const prompt = `Screening Agent: Evaluate fit for Property: ${JSON.stringify(property)}
against Investor Profile: ${JSON.stringify(profile)}
and Underwriting metrics: ${JSON.stringify(underwrite)}`;

          trace('Calling AI Gateway for screening evaluation');
          const screeningTool = ToolRegistry.get('generate_screening_result')!;
          return screeningTool.handler({ prompt, systemInstruction }, ctx);
        },
      );

      trace(
        `Screening complete. Score: ${screeningResult.score}, Verdict: ${screeningResult.verdict}`,
      );

      const profile = await this.db.client.investorProfile.findUnique({
        where: { id: investorProfileId },
      });
      const config = (profile?.constraintsJson as any) || {};
      const requireScreeningApproval =
        config.requireScreeningApproval !== false;

      if (!requireScreeningApproval) {
        trace(
          'Screening report auto-approved (requireScreeningApproval is disabled). Publishing document.',
        );
        await this.db.client.$transaction(async (tx) => {
          const doc = await tx.document.create({
            data: {
              workspaceId,
              entityType: 'property',
              entityId: propertyId || '00000000-0000-0000-0000-000000000000',
              documentType: 'screening_report',
              fileName: `screening_report_${jobId.slice(0, 8)}.md`,
              storagePath: `screening/report-${jobId}.md`,
              mimeType: 'text/markdown',
              status: 'completed',
            },
          });

          const updatedResult = {
            propertyId,
            investorProfileId,
            step: 'diligence',
            screeningResult,
            screeningReportId: doc.id,
            stepTrace: [
              ...stepTrace,
              'Screening report auto-approved. Proceeding to Diligence.',
            ],
            runLogs,
          };

          await tx.job.update({
            where: { id: jobId },
            data: {
              status: 'running',
              progressPct: 34,
              resultRefJson: updatedResult,
            },
          });
        });

        await this.agentQueue.add(
          'diligence_and_memo',
          {
            jobId,
            workspaceId,
            propertyId,
            investorProfileId,
          },
          {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          },
        );
      } else {
        trace('Awaiting human review to proceed to Diligence Phase (Gate A)');

        await this.db.client.job.update({
          where: { id: jobId },
          data: {
            status: 'awaiting_approval',
            progressPct: 33,
            resultRefJson: {
              propertyId,
              investorProfileId,
              step: 'screening',
              screeningResult,
              stepTrace,
              runLogs,
            },
          },
        });
      }
    } catch (e: any) {
      if (e.message?.includes('Blocked run')) {
        return;
      }
      console.error(`Screening Agent run failed for job ${jobId}`, e);
      log(`Error encountered: ${e.message || e}`);
      await this.db.client.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          progressPct: 100,
          errorMessage: e.message || 'Screening execution failed.',
          resultRefJson: {
            propertyId,
            investorProfileId,
            step: 'screening',
            stepTrace,
            runLogs,
          },
        },
      });
    }
  }

  async approveScreening(workspaceId: string, jobId: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'awaiting_approval' && job.status !== 'blocked') {
      throw new BadRequestException(
        `Job is in status ${job.status}, cannot approve screening`,
      );
    }
    const resultRef = job.resultRefJson as any;
    if (resultRef?.step !== 'screening') {
      throw new BadRequestException(
        `Job is at step ${resultRef?.step}, not screening`,
      );
    }

    const propertyId = resultRef.propertyId;
    const investorProfileId = resultRef.investorProfileId;

    const updatedJob = await this.db.client.$transaction(async (tx) => {
      // Create a workspace Document of type "screening_report" (Gate A approval log)
      const doc = await tx.document.create({
        data: {
          workspaceId,
          entityType: 'property',
          entityId: propertyId || '00000000-0000-0000-0000-000000000000',
          documentType: 'screening_report',
          fileName: `screening_report_${jobId.slice(0, 8)}.md`,
          storagePath: `screening/report-${jobId}.md`,
          mimeType: 'text/markdown',
          status: 'completed',
        },
      });

      const updatedResult = {
        ...resultRef,
        screeningReportId: doc.id,
        step: 'diligence',
        stepTrace: [
          ...(resultRef.stepTrace || []),
          'Screening report approved by human. Proceeding to Diligence.',
        ],
      };

      // Transition job to running and start background execution for Phase 2: Diligence & Memo
      return tx.job.update({
        where: { id: jobId },
        data: {
          status: 'running',
          progressPct: 34,
          resultRefJson: updatedResult,
          errorMessage: null, // clear any blocking message
        },
      });
    });

    await this.agentQueue.add(
      'diligence_and_memo',
      {
        jobId,
        workspaceId,
        propertyId,
        investorProfileId,
      },
      {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    );

    return updatedJob;
  }

  async rejectScreening(workspaceId: string, jobId: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    const resultRef = job.resultRefJson as any;
    if (job.status !== 'awaiting_approval' && job.status !== 'blocked') {
      throw new BadRequestException(
        `Job is in status ${job.status}, cannot reject`,
      );
    }

    const updatedResult = {
      ...resultRef,
      stepTrace: [
        ...(resultRef?.stepTrace || []),
        'Screening report rejected by human. Terminating workflow.',
      ],
    };

    return this.db.client.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: 'Rejected at screening human gate.',
        resultRefJson: updatedResult,
      },
    });
  }

  async processDiligenceAndMemoBackground(
    jobId: string,
    workspaceId: string,
    propertyId: string,
    investorProfileId: string,
    reactState?: any,
  ) {
    if (reactState) {
      /* ignore */
    }
    const job = await this.db.client.job.findUnique({ where: { id: jobId } });
    if (!job) return;

    const resultRef = job.resultRefJson as any;
    const runLogs = resultRef.runLogs || [];
    const stepTrace = resultRef.stepTrace || [];

    const log = (message: string) => {
      runLogs.push({ timestamp: new Date().toISOString(), message });
    };

    const trace = (step: string) => {
      stepTrace.push(step);
      log(`Trace step: ${step}`);
    };

    try {
      const context: RunContext = {
        workspaceId,
        propertyId,
        investorProfileId,
        jobId,
        db: this.db,
        aiGateway: this.aiGateway,
        runLogs,
        stepTrace,
      };

      trace('Diligence Agent initiated');
      await this.db.client.job.update({
        where: { id: jobId },
        data: { progressPct: 45 },
      });

      const diligenceResult = await AgentRuntimeCore.executeStep<any>(
        'diligence_agent',
        'diligence',
        context,
        async (ctx) => {
          trace('Querying property details for diligence context');
          const propertyTool = ToolRegistry.get('fetch_property_data')!;
          const property = await propertyTool.handler({ propertyId }, ctx);

          trace('Querying underwriting records for diligence context');
          const underwriteTool = ToolRegistry.get('fetch_underwrite_data')!;
          const underwrite = await underwriteTool.handler({ propertyId }, ctx);

          trace('Querying property evidence ledger');
          const evidenceTool = ToolRegistry.get('fetch_evidence_records')!;
          const evidence = await evidenceTool.handler({ propertyId }, ctx);

          if (evidence.length === 0) {
            trace(
              'Warning: Property evidence ledger is empty. Skipping lease verification.',
            );
          } else {
            trace(
              `Found ${evidence.length} evidence records. Running validation checks.`,
            );
          }

          const systemInstruction =
            await this.promptRegistry.getPrompt('diligence_agent');

          const prompt = `Perform due diligence for Property ID: "${propertyId}"
<property_details>
${JSON.stringify(property)}
</property_details>
<underwriting_records>
${JSON.stringify(underwrite)}
</underwriting_records>
<evidence_records>
${JSON.stringify(evidence)}
</evidence_records>`;

          const diligenceTool = ToolRegistry.get('generate_diligence_result')!;
          return diligenceTool.handler({ prompt, systemInstruction }, ctx);
        },
      );

      trace(
        `Diligence complete. Risk Level: ${diligenceResult.riskLevel}, Verified Leases: ${diligenceResult.verifiedLeasesCount}`,
      );

      await this.db.client.job.update({
        where: { id: jobId },
        data: {
          progressPct: 66,
          resultRefJson: {
            ...resultRef,
            step: 'memo',
            diligenceResult,
            stepTrace,
            runLogs,
          },
        },
      });

      trace('Memo Agent initiated');
      await this.db.client.job.update({
        where: { id: jobId },
        data: { progressPct: 75 },
      });

      const memoResult = await AgentRuntimeCore.executeStep<any>(
        'memo_agent',
        'memo',
        context,
        async (ctx) => {
          const propertyTool = ToolRegistry.get('fetch_property_data')!;
          const property = await propertyTool.handler({ propertyId }, ctx);

          const profileTool = ToolRegistry.get('fetch_profile_data')!;
          const profile = await profileTool.handler({ investorProfileId }, ctx);

          const underwriteTool = ToolRegistry.get('fetch_underwrite_data')!;
          const underwrite = await underwriteTool.handler({ propertyId }, ctx);

          const systemInstruction =
            await this.promptRegistry.getPrompt('memo_agent');

          const prompt = `Generate memo for Property: ${JSON.stringify(property)}
Investor Profile: ${JSON.stringify(profile)}
Underwriting: ${JSON.stringify(underwrite)}
Screening Result: ${JSON.stringify(resultRef.screeningResult)}
Diligence Result: ${JSON.stringify(diligenceResult)}`;

          const memoTool = ToolRegistry.get('generate_memo_text')!;
          return memoTool.handler({ prompt, systemInstruction }, ctx);
        },
      );

      trace('Memo draft finalized. Evaluating gating policy.');

      const profile = await this.db.client.investorProfile.findUnique({
        where: { id: investorProfileId },
      });
      const config = (profile?.constraintsJson as any) || {};
      const requireMemoApproval = config.requireMemoApproval !== false;

      if (!requireMemoApproval) {
        trace(
          'Investment memo auto-approved (requireMemoApproval is disabled). Publishing document.',
        );
        await this.db.client.$transaction(async (tx) => {
          const doc = await tx.document.create({
            data: {
              workspaceId,
              entityType: 'property',
              entityId: propertyId || '00000000-0000-0000-0000-000000000000',
              documentType: 'investment_memo',
              fileName: `investment_memo_${jobId.slice(0, 8)}.md`,
              storagePath: `memos/memo-${jobId}.md`,
              mimeType: 'text/markdown',
              status: 'completed',
            },
          });

          const updatedResult = {
            ...resultRef,
            step: 'memo',
            diligenceResult,
            memoResult,
            documentId: doc.id,
            stepTrace: [
              ...stepTrace,
              'Investment memo finalized and document published.',
            ],
            runLogs,
          };

          await tx.job.update({
            where: { id: jobId },
            data: {
              status: 'completed',
              progressPct: 100,
              resultRefJson: updatedResult,
            },
          });
        });
      } else {
        trace('Memo draft finalized. Awaiting final human review (Gate B)');

        await this.db.client.job.update({
          where: { id: jobId },
          data: {
            status: 'awaiting_approval',
            progressPct: 100,
            resultRefJson: {
              ...resultRef,
              step: 'memo',
              diligenceResult,
              memoResult,
              stepTrace,
              runLogs,
            },
          },
        });
      }
    } catch (e: any) {
      console.error(`Diligence/Memo Agent run failed for job ${jobId}`, e);
      log(`Error encountered: ${e.message || e}`);
      await this.db.client.job.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          progressPct: 100,
          errorMessage: e.message || 'Diligence/Memo execution failed.',
          resultRefJson: {
            ...resultRef,
            step: 'diligence',
            stepTrace,
            runLogs,
          },
        },
      });
    }
  }

  async approveWorkflowMemo(workspaceId: string, jobId: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'awaiting_approval') {
      throw new BadRequestException(
        `Job is in status ${job.status}, cannot approve memo`,
      );
    }
    const resultRef = job.resultRefJson as any;
    if (resultRef?.step !== 'memo') {
      throw new BadRequestException(
        `Job is at step ${resultRef?.step}, not memo`,
      );
    }

    const propertyId = resultRef.propertyId;

    return this.db.client.$transaction(async (tx) => {
      // Create a final Document of type "investment_memo"
      const doc = await tx.document.create({
        data: {
          workspaceId,
          entityType: 'property',
          entityId: propertyId || '00000000-0000-0000-0000-000000000000',
          documentType: 'investment_memo',
          fileName: `investment_memo_${jobId.slice(0, 8)}.md`,
          storagePath: `memos/memo-${jobId}.md`,
          mimeType: 'text/markdown',
          status: 'completed',
        },
      });

      const updatedResult = {
        ...resultRef,
        documentId: doc.id,
        stepTrace: [
          ...(resultRef.stepTrace || []),
          'Investment memo finalized and document published.',
        ],
      };

      return tx.job.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          resultRefJson: updatedResult,
        },
      });
    });
  }

  async rejectWorkflowMemo(workspaceId: string, jobId: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'awaiting_approval') {
      throw new BadRequestException(
        `Job is in status ${job.status}, cannot reject`,
      );
    }
    const resultRef = job.resultRefJson as any;

    const updatedResult = {
      ...resultRef,
      stepTrace: [
        ...(resultRef?.stepTrace || []),
        'Investment memo rejected by human review.',
      ],
    };

    return this.db.client.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: 'Rejected at memo human gate.',
        resultRefJson: updatedResult,
      },
    });
  }

  async getAgentAnalytics(
    workspaceId: string,
  ): Promise<AgentAnalyticsResponse> {
    const jobs = await this.db.client.job.findMany({
      where: { workspaceId },
    });

    const aiRuns = await this.db.client.aiRun.findMany({
      where: { workspaceId },
    });

    const totalRuns = jobs.length;
    const completedCount = jobs.filter((j) => j.status === 'completed').length;
    const completionRate = totalRuns > 0 ? completedCount / totalRuns : 1.0;

    let totalLatencyMs = 0;
    let latencyCount = 0;
    for (const job of jobs) {
      if (job.status === 'completed' || job.status === 'failed') {
        const diff = job.updatedAt.getTime() - job.createdAt.getTime();
        totalLatencyMs += diff;
        latencyCount++;
      }
    }
    const averageLatencyMs =
      latencyCount > 0 ? totalLatencyMs / latencyCount : 0;

    const cumulativeCost = aiRuns.reduce((acc, run) => {
      const cost = run.costEstimate ? Number(run.costEstimate) : 0;
      return acc + cost;
    }, 0);

    // Group failures
    const failedJobs = jobs.filter((j) => j.status === 'failed');
    const hotspotMap = new Map<
      string,
      { step: string; count: number; errorMessage: string }
    >();

    for (const job of failedJobs) {
      const step = (job.resultRefJson as any)?.step || 'unknown';
      const msg = job.errorMessage || 'Unknown background execution error.';
      const key = `${step}:${msg}`;
      const existing = hotspotMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        hotspotMap.set(key, {
          step,
          count: 1,
          errorMessage: msg,
        });
      }
    }

    const failureHotspots = Array.from(hotspotMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalRuns,
      completionRate,
      averageLatencyMs,
      cumulativeCost,
      failureHotspots,
    };
  }

  async getAgentDefinitions() {
    return AgentRegistry.list();
  }

  async getToolDefinitions() {
    return ToolRegistry.list().map((t) => ({
      name: t.name,
      description: t.description,
      version: t.version,
    }));
  }

  async togglePolicy(workspaceId: string, payload: TogglePolicyRequest) {
    let profile = await this.db.client.investorProfile.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    if (!profile) {
      profile = await this.db.client.investorProfile.create({
        data: {
          workspaceId,
          name: 'Default Guidelines',
          baseCurrency: 'AED',
          capitalAvailable: 1000000,
          riskTolerance: 'moderate',
          investmentHorizonMonths: 60,
          incomeVsGrowthPreference: 'balanced',
          financingPreference: 'cash',
        },
      });
    }

    const currentConstraints = (profile.constraintsJson as any) || {};

    const updatedConstraints = {
      ...currentConstraints,
      requireScreeningApproval:
        payload.requireScreeningApproval ??
        currentConstraints.requireScreeningApproval,
      requireMemoApproval:
        payload.requireMemoApproval ?? currentConstraints.requireMemoApproval,
      watchlistCheckIntervalSeconds:
        payload.watchlistCheckIntervalSeconds ??
        currentConstraints.watchlistCheckIntervalSeconds,
    };

    const updatedProfile = await this.db.client.investorProfile.update({
      where: { id: profile.id },
      data: {
        constraintsJson: updatedConstraints,
      },
    });

    return {
      success: true,
      constraints: updatedProfile.constraintsJson,
    };
  }

  async approveAction(workspaceId: string, jobId: string, toolName: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'suspended') {
      throw new BadRequestException(`Job is not in suspended status.`);
    }

    const resultRef = job.resultRefJson as any;
    const pendingAction = resultRef.pendingAction;
    if (!pendingAction || pendingAction.toolName !== toolName) {
      throw new BadRequestException(`Pending action mismatch or not found.`);
    }

    const approvedActions = resultRef.approvedActions || [];
    approvedActions.push(pendingAction);

    const updatedJob = await this.db.client.job.update({
      where: { id: jobId },
      data: {
        status: 'running',
        resultRefJson: {
          ...resultRef,
          pendingAction: null,
          approvedActions,
        },
      },
    });

    await this.agentQueue.add(job.jobType, {
      jobId: job.id,
      workspaceId: job.workspaceId,
      propertyId: (job.inputJson as any).propertyId,
      investorProfileId: (job.inputJson as any).investorProfileId,
      reactState: resultRef.reactState,
    });

    return updatedJob;
  }

  async rejectAction(workspaceId: string, jobId: string, toolName: string) {
    const job = await this.db.client.job.findUnique({
      where: { id: jobId },
    });
    if (!job || job.workspaceId !== workspaceId) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'suspended') {
      throw new BadRequestException(`Job is not in suspended status.`);
    }

    return this.db.client.job.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: `Action "${toolName}" was rejected by user.`,
      },
    });
  }
}
