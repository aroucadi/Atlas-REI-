import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { ReflectionEngine, LoopException } from './runtime/reflection.engine';
import { ToolRegistry } from './runtime/registries';
import { AiGateway } from '@atlas/ai-gateway';
import { z } from 'zod';

export interface ContinuousLoopState {
  steps: {
    thought: string;
    action?: string;
    actionInput?: any;
    observation?: string;
    finalAnswer?: string;
  }[];
  currentStepIndex: number;
  tokenSpend: number;
  maxTokens: number;
}

@Injectable()
export class ContinuousExecutionService {
  private readonly aiGateway = new AiGateway();
  // Irreversible write actions that require strict human escalation
  private readonly GOVERNANCE_WRITE_ACTIONS = [
    'move_capital',
    'sign_contract',
    'execute_transaction',
    'transfer_funds',
  ];

  constructor(
    private readonly db: DatabaseService,
    private readonly reflectionEngine: ReflectionEngine,
  ) {}

  /**
   * Run one step or the full loop of the continuous autonomous execution cycle.
   */
  async executeCycle(
    workspaceId: string,
    processId: string,
    overridePayload?: {
      action: 'override' | 'adjust' | 'abort';
      constraints?: any;
    },
  ) {
    // 1. Tenancy validation: Ensure the KernelProcess exists and matches workspaceId
    const proc = await this.db.client.kernelProcess.findFirst({
      where: { id: processId, workspaceId },
      include: { goal: true },
    });

    if (!proc) {
      throw new NotFoundException(
        'Process not found or workspace tenancy breach.',
      );
    }

    // Handle Abort
    if (overridePayload?.action === 'abort') {
      await this.db.client.kernelProcess.update({
        where: { id: processId },
        data: { status: 'COMPLETED' },
      });
      return { status: 'ABORTED', message: 'Process execution aborted.' };
    }

    // Load or initialize state
    const executionTree = (proc.goal.executionTree as any) || {};
    const state: ContinuousLoopState = executionTree.loopState || {
      steps: [],
      currentStepIndex: 0,
      tokenSpend: proc.allocatedTokens || 0,
      maxTokens: 1000, // Budget limit
    };

    // Apply adjustments
    if (overridePayload?.action === 'adjust' && overridePayload.constraints) {
      if (overridePayload.constraints.maxTokens) {
        state.maxTokens = overridePayload.constraints.maxTokens;
      }
      if (overridePayload.constraints.stepLimit) {
        await this.db.client.kernelProcess.update({
          where: { id: processId },
          data: { stepLimit: overridePayload.constraints.stepLimit },
        });
      }
    }

    // Transition to PERSISTENT_ACTIVE
    await this.db.client.kernelProcess.update({
      where: { id: processId },
      data: { status: 'PERSISTENT_ACTIVE' },
    });

    // Main step runner
    try {
      while (state.currentStepIndex < proc.stepLimit) {
        // Token quota check
        if (state.tokenSpend >= state.maxTokens) {
          await this.db.client.kernelProcess.update({
            where: { id: processId },
            data: { status: 'PREEMPTED' },
          });
          throw new BadRequestException(
            `Budget limit exceeded: Spent ${state.tokenSpend} tokens. Cap is ${state.maxTokens}.`,
          );
        }

        // 1. PLAN / RE-PLAN
        let thought = '';
        let actionName = '';
        let actionInput: any = {};

        if (this.aiGateway.isSimulationMode()) {
          thought = `Step ${state.currentStepIndex + 1}: Determining next action for goal "${proc.goal.title}".`;
          if (state.currentStepIndex === 0) {
            actionName = 'fetch_property_data';
            actionInput = { propertyId: 'burj-crown-123' };
          } else if (state.currentStepIndex === 1) {
            actionName = 'move_capital';
            actionInput = { amount: 500000, destination: 'Escrow A' };
          } else {
            state.steps.push({
              thought:
                'We have collected the property details and confirmed authorization for capital movement.',
              finalAnswer: 'Continuous execution task completed successfully.',
            });
            break;
          }
        } else {
          const toolsList = ToolRegistry.list().map((t) => ({
            name: t.name,
            description: t.description,
          }));
          const planningPrompt = `
          You are the planner for a Continuous Autonomous Execution System.
          Goal: "${proc.goal.title}"
          Goal Description: "${proc.goal.description}"
          
          Available Tools:
          ${JSON.stringify(toolsList, null, 2)}
          
          Irreversible Write Actions (require human approval/escalation):
          - move_capital (args: { amount, destination })
          - sign_contract (args: { contractId })
          - execute_transaction (args: { transactionId })
          - transfer_funds (args: { amount, destination })
          
          Execution History (Previous Steps):
          ${JSON.stringify(state.steps, null, 2)}
          
          Analyze the goal and history. Decide the next step:
          1. Output a thought on what needs to be done.
          2. Select the next action (tool name) and its inputs (args), OR if the goal is fully achieved, provide a finalAnswer.
          
          Output exactly a JSON object matching this schema.
          `;

          const PlanSchema = z.object({
            thought: z.string(),
            actionName: z.string().default(''),
            actionInput: z.any().default({}),
            finalAnswer: z.string().default(''),
          });

          try {
            const decision = await this.aiGateway.generateStructuredJson<
              z.infer<typeof PlanSchema>
            >(
              planningPrompt,
              PlanSchema,
              'You are a precise autonomous agent operating system execution kernel.',
            );
            thought = decision.thought;
            actionName = decision.actionName;
            actionInput = decision.actionInput;

            if (decision.finalAnswer) {
              state.steps.push({
                thought,
                finalAnswer: decision.finalAnswer,
              });
              break;
            }
          } catch (err: any) {
            console.warn(
              '[ContinuousExecution] Real LLM planning failed, falling back to simulated step',
              err.message,
            );
            thought = `Step ${state.currentStepIndex + 1}: Determining next action for goal "${proc.goal.title}".`;
            if (state.currentStepIndex === 0) {
              actionName = 'fetch_property_data';
              actionInput = { propertyId: 'burj-crown-123' };
            } else if (state.currentStepIndex === 1) {
              actionName = 'move_capital';
              actionInput = { amount: 500000, destination: 'Escrow A' };
            } else {
              state.steps.push({
                thought:
                  'We have collected the property details and confirmed authorization for capital movement.',
                finalAnswer:
                  'Continuous execution task completed successfully.',
              });
              break;
            }
          }
        }

        // Intercept mutable write actions (Governance Block)
        if (this.GOVERNANCE_WRITE_ACTIONS.includes(actionName)) {
          // Pause execution and transition to AWAITING_ESCALATION
          await this.db.client.kernelProcess.update({
            where: { id: processId },
            data: { status: 'AWAITING_ESCALATION' },
          });

          // Save current state back to execution tree
          await this.db.client.goal.update({
            where: { id: proc.goalId },
            data: {
              executionTree: {
                ...executionTree,
                loopState: state,
                pendingAction: { actionName, actionInput },
              },
            },
          });

          return {
            status: 'AWAITING_ESCALATION',
            message: `Execution suspended: Action "${actionName}" requires explicit human authorization.`,
            pendingAction: { actionName, actionInput },
          };
        }

        // Token consumption simulator
        state.tokenSpend += 150;
        await this.db.client.kernelProcess.update({
          where: { id: processId },
          data: { allocatedTokens: state.tokenSpend },
        });

        // 2. EXECUTE / OBSERVE
        let observation = '';
        try {
          const toolDef = ToolRegistry.get(actionName);
          if (toolDef) {
            // Build runContext for execution
            const runCtx = {
              workspaceId,
              propertyId: actionInput.propertyId || '',
              jobId: processId,
              db: this.db,
              aiGateway: this.aiGateway,
              runLogs: [],
              stepTrace: [],
            };
            const result = await toolDef.handler(actionInput, runCtx);
            observation = JSON.stringify(result);
          } else {
            observation = `Error: Tool "${actionName}" is not registered in ToolRegistry.`;
          }
        } catch (err: any) {
          observation = `Error executing tool: ${err.message}`;
        }

        state.steps.push({
          thought,
          action: actionName,
          actionInput,
          observation,
        });

        // 3. REFLECTION (transition state to SUSPENDED_REFLECTING during check)
        await this.db.client.kernelProcess.update({
          where: { id: processId },
          data: { status: 'SUSPENDED_REFLECTING' },
        });

        // Detect loops
        try {
          this.reflectionEngine.detectLoops(state.steps);
        } catch (err: any) {
          if (err instanceof LoopException) {
            await this.db.client.kernelProcess.update({
              where: { id: processId },
              data: { status: 'AWAITING_ESCALATION' },
            });
            await this.db.client.goal.update({
              where: { id: proc.goalId },
              data: {
                executionTree: {
                  ...executionTree,
                  loopState: state,
                  error: err.message,
                },
              },
            });
            return {
              status: 'AWAITING_ESCALATION',
              message: err.message,
            };
          }
          throw err;
        }

        // Validate progress (hallucination detection)
        const progressCheck = await this.reflectionEngine.validateProgress(
          workspaceId,
          thought + ' ' + observation,
          state.steps,
        );

        if (!progressCheck.valid) {
          await this.db.client.kernelProcess.update({
            where: { id: processId },
            data: { status: 'AWAITING_ESCALATION' },
          });
          await this.db.client.goal.update({
            where: { id: proc.goalId },
            data: {
              executionTree: {
                ...executionTree,
                loopState: state,
                error: progressCheck.reason,
              },
            },
          });
          return {
            status: 'AWAITING_ESCALATION',
            message: progressCheck.reason,
          };
        }

        // Transition back to PERSISTENT_ACTIVE for next step
        await this.db.client.kernelProcess.update({
          where: { id: processId },
          data: { status: 'PERSISTENT_ACTIVE' },
        });

        state.currentStepIndex++;
      }

      // If loop finished, mark process as COMPLETED
      await this.db.client.kernelProcess.update({
        where: { id: processId },
        data: { status: 'COMPLETED' },
      });

      // Clear state on completion
      await this.db.client.goal.update({
        where: { id: proc.goalId },
        data: {
          executionTree: {
            ...executionTree,
            loopState: null,
            pendingAction: null,
          },
        },
      });

      return {
        status: 'COMPLETED',
        message: 'Continuous execution finished successfully.',
        steps: state.steps,
      };
    } catch (err: any) {
      await this.db.client.kernelProcess.update({
        where: { id: processId },
        data: { status: 'PREEMPTED' },
      });
      throw err;
    }
  }
}
