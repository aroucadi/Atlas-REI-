import { z } from 'zod';
import { RunContext } from './types';
import { ToolRegistry } from './registries';
import { PolicyEngine } from './policy-engine';
import { BadRequestException } from '@nestjs/common';

export const ReActStepSchema = z.union([
  z.object({
    thought: z.string(),
    action: z.string(),
    actionInput: z.any(),
  }),
  z.object({
    thought: z.string(),
    finalAnswer: z.string(),
  }),
]);

export type ReActStep = z.infer<typeof ReActStepSchema>;

export interface ReActLoopState {
  steps: {
    thought: string;
    action?: string;
    actionInput?: any;
    observation?: string;
    finalAnswer?: string;
  }[];
  currentStepIndex: number;
}

export class ReActExecutionEngine {
  private static readonly MAX_STEPS = 5;

  static async run(
    agentId: string,
    context: RunContext,
    initialPrompt: string,
    savedState?: ReActLoopState,
  ): Promise<{ status: 'completed' | 'suspended'; result?: any }> {
    const { db, jobId, runLogs, stepTrace } = context;

    const log = (message: string) => {
      runLogs.push({ timestamp: new Date().toISOString(), message });
    };

    const trace = (step: string) => {
      stepTrace.push(step);
      log(`Trace step: ${step}`);
    };

    // Initialize or load loop state
    const state: ReActLoopState = savedState || {
      steps: [],
      currentStepIndex: 0,
    };

    // Pre-execution Check: Check for Job cancellation
    const currentJob = await db.client.job.findUnique({ where: { id: jobId } });
    if (
      !currentJob ||
      currentJob.status === 'failed' ||
      currentJob.status === 'completed'
    ) {
      trace(`Run loop halted: Job ${jobId} has been cancelled or terminated.`);
      throw new Error(`Job execution terminated.`);
    }

    // Resolve dynamic policy config from investor profile if available
    let policyConfig: any = {};
    let profileId: string | undefined;
    let accumulatedSpend = 0.0;
    let monthlyBudgetCap = 100.0;

    if (context.workspaceId) {
      const profile = await db.client.investorProfile.findFirst({
        where: { workspaceId: context.workspaceId },
        orderBy: { createdAt: 'desc' },
      });
      if (profile) {
        profileId = profile.id;
        const constraints = (profile.constraintsJson as any) || {};
        if (constraints.policies) {
          policyConfig = constraints.policies || {};
        }
        accumulatedSpend = constraints.accumulatedSpend ?? 0.0;
        monthlyBudgetCap = constraints.monthlyBudgetCap ?? 100.0;
      }
    }

    // Budget Cap Enforcement
    if (accumulatedSpend >= monthlyBudgetCap) {
      const budgetError = `Budget Veto: Monthly spend cap of $${monthlyBudgetCap} exceeded (Current spend: $${accumulatedSpend}).`;
      trace(budgetError);
      throw new BadRequestException(budgetError);
    }

    while (state.currentStepIndex < this.MAX_STEPS) {
      trace(`ReAct Loop Step ${state.currentStepIndex + 1}/${this.MAX_STEPS}`);

      // 1. Generate next step thoughts and actions
      let stepResult: ReActStep;

      if (context.aiGateway.isSimulationMode()) {
        stepResult = this.simulateNextStep(state, context);
      } else {
        // Construct loop prompt with past history
        const historyPrompt = state.steps
          .map(
            (s, idx) =>
              `Step ${idx + 1}:\nThought: ${s.thought}\n` +
              (s.action
                ? `Action: ${s.action}\nInput: ${JSON.stringify(s.actionInput)}\nObservation: ${s.observation}\n`
                : `Final Answer: ${s.finalAnswer}\n`),
          )
          .join('\n');

        const prompt =
          `${initialPrompt}\n\n` +
          `Execution History:\n${historyPrompt || 'No history yet.'}\n\n` +
          `Generate the next Step as JSON matching either:\n` +
          `- Thought and Action call\n` +
          `- Thought and Final Answer`;

        const systemInstruction =
          `You are an autonomous agent executing a ReAct loop. In each turn, you must think and either call a tool with correct inputs, or produce the final answer. Available tools: ` +
          ToolRegistry.list()
            .map((t) => `${t.name}: ${t.description}`)
            .join(', ');

        try {
          stepResult =
            await context.aiGateway.generateStructuredJson<ReActStep>(
              prompt,
              ReActStepSchema,
              systemInstruction,
            );
        } catch (err: any) {
          log(
            `Error parsing LLM JSON output: ${err.message}. Retrying with error details fed back...`,
          );
          // Feed the parsing error back into the observation of a dummy step so the agent can self-correct
          state.steps.push({
            thought: 'Failed to generate correct structural output.',
            action: 'format_correction',
            actionInput: {},
            observation: `Schema formatting error: ${err.message}. Please generate output matching the schema precisely.`,
          });
          state.currentStepIndex++;
          continue;
        }
      }

      // Charge spend
      if (profileId) {
        const currentProfile = await db.client.investorProfile.findUnique({
          where: { id: profileId },
        });
        if (currentProfile) {
          const currentConstraints =
            (currentProfile.constraintsJson as any) || {};
          const nextSpend =
            (currentConstraints.accumulatedSpend ?? 0.0) + 0.015;
          await db.client.investorProfile.update({
            where: { id: profileId },
            data: {
              constraintsJson: {
                ...currentConstraints,
                accumulatedSpend: nextSpend,
              },
            },
          });
          log(
            `Budget tracking: Incremented spend by $0.015. Total spent: $${nextSpend.toFixed(3)}`,
          );
        }
      }

      // Write compliance audit log entry for this transition
      await db.client.auditLog.create({
        data: {
          workspaceId: context.workspaceId,
          actorUserId: context.userId || null,
          entityType: 'agent_run',
          entityId: jobId,
          action: `react_loop_step_${state.currentStepIndex + 1}`,
          beforeJson: { currentStepIndex: state.currentStepIndex } as any,
          afterJson: {
            thought: stepResult.thought,
            action: (stepResult as any).action || 'finalAnswer',
          } as any,
        },
      });

      log(`Thought: ${stepResult.thought}`);

      if ('finalAnswer' in stepResult) {
        // Final Answer reached
        state.steps.push({
          thought: stepResult.thought,
          finalAnswer: stepResult.finalAnswer,
        });
        trace('Final Answer reached in ReAct loop.');
        return {
          status: 'completed',
          result: {
            answer: stepResult.finalAnswer,
            steps: state.steps,
          },
        };
      }

      // Step has a tool execution action
      const { action: toolName, actionInput } = stepResult;
      log(
        `Action: Calling tool "${toolName}" with input: ${JSON.stringify(actionInput)}`,
      );

      // Evaluate Tool Permissions
      try {
        const agent = {
          id: agentId,
          name: agentId,
          description: '',
          version: '1.0.0',
          requiredTools: [toolName],
          policies: [],
          systemInstruction: '',
        };
        PolicyEngine.evaluateToolPolicy(agent, toolName);
      } catch (err: any) {
        log(`Policy Engine Veto: ${err.message}`);
        state.steps.push({
          thought: stepResult.thought,
          action: toolName,
          actionInput,
          observation: `Policy Blocked Action: ${err.message}`,
        });
        state.currentStepIndex++;
        continue;
      }

      // Check Human-in-the-Loop approval gate
      const needsApproval =
        PolicyEngine.requiresApproval(agentId, toolName, policyConfig) ||
        (PolicyEngine as any).requiresToolApproval?.(toolName, policyConfig);

      if (needsApproval) {
        // Check if this specific tool call has already been approved
        const approvedActions =
          (currentJob.resultRefJson as any)?.approvedActions || [];
        const isAlreadyApproved = approvedActions.some(
          (app: any) =>
            app.stepIndex === state.currentStepIndex &&
            app.toolName === toolName &&
            JSON.stringify(app.actionInput) === JSON.stringify(actionInput),
        );

        if (!isAlreadyApproved) {
          trace(`Suspension Gate: Tool "${toolName}" requires human approval.`);
          // Save execution state to the job so it can be resumed
          state.steps.push({
            thought: stepResult.thought,
            action: toolName,
            actionInput,
            observation: 'Awaiting human authorization...',
          });

          await db.client.job.update({
            where: { id: jobId },
            data: {
              status: 'suspended',
              resultRefJson: {
                runLogs,
                stepTrace,
                reactState: state,
                pendingAction: {
                  stepIndex: state.currentStepIndex,
                  toolName,
                  actionInput,
                },
                approvedActions,
              } as any,
            },
          });

          return {
            status: 'suspended',
          };
        } else {
          log(`Action "${toolName}" was previously approved. Executing tool.`);
        }
      }

      // Execute tool
      let observation: string;
      try {
        const toolDef = ToolRegistry.get(toolName);
        if (!toolDef) {
          throw new Error(
            `Tool "${toolName}" is not registered in ToolRegistry.`,
          );
        }

        const result = await toolDef.handler(actionInput, context);
        observation =
          typeof result === 'string' ? result : JSON.stringify(result);
        log(`Observation (Success): ${observation.slice(0, 500)}`);
      } catch (err: any) {
        observation = `Tool Error: ${err.message || err}`;
        log(`Observation (Failure/Error): ${observation}`);
      }

      // Record step
      state.steps.push({
        thought: stepResult.thought,
        action: toolName,
        actionInput,
        observation,
      });

      state.currentStepIndex++;
    }

    trace('Max execution steps exceeded without final answer.');
    return {
      status: 'completed',
      result: {
        answer:
          'Loop limit exceeded. Partial analysis: ' +
          JSON.stringify(state.steps),
        steps: state.steps,
      },
    };
  }

  private static simulateNextStep(
    state: ReActLoopState,
    context: RunContext,
  ): ReActStep {
    const stepIdx = state.currentStepIndex;
    if (stepIdx === 0) {
      return {
        thought: 'I need to fetch property details for the analysis.',
        action: 'fetch_property_data',
        actionInput: { propertyId: context.propertyId },
      };
    } else if (stepIdx === 1) {
      return {
        thought: 'I need to check the active investor profile parameters.',
        action: 'fetch_profile_data',
        actionInput: { investorProfileId: context.investorProfileId },
      };
    } else {
      return {
        thought:
          'I have gathered property data and investor profile rules. I will now compile the final report.',
        finalAnswer:
          'Burj Crown real estate analysis successfully run. All constraints pass.',
      };
    }
  }
}
