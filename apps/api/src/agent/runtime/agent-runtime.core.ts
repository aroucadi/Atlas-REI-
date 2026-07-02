import { BadRequestException } from '@nestjs/common';
import { RunContext, RunVersionInfo } from './types';
import { AgentRegistry, ToolRegistry } from './registries';
import { PolicyEngine, POLICY_VERSIONS } from './policy-engine';
import { EvaluationHarness } from './evaluation-harness';

export class AgentRuntimeCore {
  /**
   * Executes a registered agent's specific step with governed logs, policy gates, retries, and metrics.
   */
  static async executeStep<T>(
    agentId: string,
    stepName: string,
    context: RunContext,
    executor: (ctx: RunContext) => Promise<T>,
    options: {
      retries?: number;
      backoffMs?: number;
    } = {},
  ): Promise<T> {
    const agent = AgentRegistry.get(agentId);
    if (!agent) {
      throw new BadRequestException(
        `Agent "${agentId}" is not registered in AgentRegistry.`,
      );
    }

    const { db, jobId, runLogs, stepTrace } = context;

    const log = (message: string) => {
      runLogs.push({ timestamp: new Date().toISOString(), message });
    };

    const trace = (step: string) => {
      stepTrace.push(step);
      log(`Trace step: ${step}`);
    };

    // 1. Pre-execution Check: Check for Job cancellation
    const currentJob = await db.client.job.findUnique({ where: { id: jobId } });
    if (
      !currentJob ||
      currentJob.status === 'failed' ||
      currentJob.status === 'completed'
    ) {
      trace(`Run step halted: Job ${jobId} has been cancelled or terminated.`);
      throw new Error(`Job execution terminated.`);
    }

    // 2. Policy Engine Check: Tool Permissions & Restrictions
    trace(
      `Evaluating runtime policies for agent "${agentId}", step "${stepName}"`,
    );
    for (const toolName of agent.requiredTools) {
      PolicyEngine.evaluateToolPolicy(agent, toolName);
    }

    // 3. Setup Versioning metadata
    const toolVersions: Record<string, string> = {};
    for (const toolName of agent.requiredTools) {
      const toolDef = ToolRegistry.get(toolName);
      toolVersions[toolName] = toolDef?.version || '1.0.0';
    }
    const versionInfo: RunVersionInfo = {
      agentVersion: agent.version,
      promptVersion: '1.0.0', // Standard prompt version
      toolVersions,
      policyVersions: POLICY_VERSIONS,
    };

    // Log version attribution
    log(`Version attribution: ${JSON.stringify(versionInfo)}`);

    const maxRetries = options.retries ?? 2;
    let attempt = 0;
    let delay = options.backoffMs ?? 200;
    const startTime = Date.now();

    while (attempt <= maxRetries) {
      try {
        attempt++;
        trace(
          `Executing step "${stepName}" (Attempt ${attempt}/${maxRetries + 1})`,
        );

        // Execute the actual step payload
        const result = await executor(context);

        const latencyMs = Date.now() - startTime;
        trace(`Step "${stepName}" successfully completed.`);

        const inputChars =
          JSON.stringify(versionInfo).length +
          (context.propertyId ? context.propertyId.length : 0);
        const outputChars =
          typeof result === 'object'
            ? JSON.stringify(result).length
            : String(result).length;
        const inputTokens = Math.ceil(inputChars / 4) + 200;
        const outputTokens = Math.ceil(outputChars / 4);
        const costEstimate = Number(
          (inputTokens * 0.000000075 + outputTokens * 0.0000003).toFixed(6),
        );

        // 4. Create AiRun record for logging and traceability
        await db.client.aiRun.create({
          data: {
            workspaceId: context.workspaceId,
            jobType: agentId,
            modelProvider: 'google',
            modelName: 'gemini-1.5-flash',
            promptVersion: versionInfo.promptVersion,
            inputRefJson: { step: stepName, versionInfo } as any,
            outputRefJson: { success: true, latencyMs } as any,
            status: 'completed',
            costEstimate,
          },
        });

        // 5. Run Evaluation Harness on success
        const evalMetrics = EvaluationHarness.evaluateRun(
          runLogs,
          stepTrace,
          latencyMs,
          costEstimate,
          true,
        );
        log(`Step evaluation metrics: ${JSON.stringify(evalMetrics)}`);

        return result;
      } catch (err: any) {
        trace(
          `Step "${stepName}" failed on attempt ${attempt}. Error: ${err.message || err}`,
        );

        if (attempt > maxRetries) {
          const latencyMs = Date.now() - startTime;
          const inputChars =
            JSON.stringify(versionInfo).length +
            (context.propertyId ? context.propertyId.length : 0);
          const inputTokens = Math.ceil(inputChars / 4) + 200;
          const costEstimate = Number((inputTokens * 0.000000075).toFixed(6));

          // Log failed AiRun
          await db.client.aiRun.create({
            data: {
              workspaceId: context.workspaceId,
              jobType: agentId,
              modelProvider: 'google',
              modelName: 'gemini-1.5-flash',
              promptVersion: versionInfo.promptVersion,
              inputRefJson: { step: stepName, versionInfo } as any,
              outputRefJson: {
                success: false,
                error: err.message || err,
              } as any,
              status: 'failed',
              errorMessage: err.message || 'Execution failed',
              costEstimate,
            },
          });

          // Run Evaluation Harness on failure
          const evalMetrics = EvaluationHarness.evaluateRun(
            runLogs,
            stepTrace,
            latencyMs,
            costEstimate,
            false,
          );
          log(`Failed step evaluation metrics: ${JSON.stringify(evalMetrics)}`);

          throw err;
        }

        // Retry with backoff
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }

    throw new Error(`Step execution failed.`);
  }
}
