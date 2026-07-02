import { EvalMetric } from './types';

export class EvaluationHarness {
  /**
   * Scores and evaluates the metrics of a completed or failed agent execution run
   */
  static evaluateRun(
    runLogs: any[],
    stepTrace: string[],
    latencyMs: number,
    cost: number,
    success: boolean,
  ): EvalMetric {
    const failureRate = success ? 0 : 1;

    // Check for policy veto logs or warnings in the traces
    const hasVeto = stepTrace.some((step) =>
      step.toLowerCase().includes('policy veto'),
    );
    const toolDiscipline = hasVeto ? 0 : 100;

    // Correctness is 100 if completed successfully, 0 on failure
    const correctness = success ? 100 : 0;

    return {
      correctness,
      toolDiscipline,
      latencyMs,
      cost,
      failureRate,
    };
  }
}
export const EVAL_VERSION = '1.0.0';
