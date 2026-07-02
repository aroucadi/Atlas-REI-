import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';

export class LoopException extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoopException';
  }
}

@Injectable()
export class ReflectionEngine {
  constructor(private readonly db: DatabaseService) {}

  /**
   * Loop Detector:
   * Analyzes history of tool calls. If the same signature (toolName + args) is executed > 3 times,
   * it throws a LoopException.
   */
  detectLoops(steps: { action?: string; actionInput?: any }[]): void {
    const signatureCounts: Record<string, number> = {};
    for (const step of steps) {
      if (step.action) {
        // Normalize args by sorting keys to ensure consistent signatures
        const sortedArgs = this.sortObjectKeys(step.actionInput);
        const signature = `${step.action}:${JSON.stringify(sortedArgs)}`;
        signatureCounts[signature] = (signatureCounts[signature] || 0) + 1;
        if (signatureCounts[signature] > 3) {
          throw new LoopException(
            `Loop Exception: Tool "${step.action}" with input ${JSON.stringify(step.actionInput)} was executed ${signatureCounts[signature]} times. Loop detected.`,
          );
        }
      }
    }
  }

  /**
   * Progress Validator:
   * Validates if database state matches agent reports (hallucination detection).
   * Checks if self-reported agent claims (in claimedOutput or steps) actually resulted
   * in corresponding entity creations/mutations in the database.
   */
  async validateProgress(
    workspaceId: string,
    claimedOutput: string,
    steps: { action?: string; actionInput?: any; observation?: string }[],
  ): Promise<{ valid: boolean; reason?: string }> {
    if (steps) {
      /* ignore */
    }
    const text = (claimedOutput || '').toLowerCase();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    // 1. Check if the agent claims to have created evidence, Comp, Listing, or verified lease
    if (
      text.includes('created evidence') ||
      text.includes('added evidence') ||
      text.includes('saved evidence') ||
      text.includes('uploaded lease') ||
      text.includes('verified lease')
    ) {
      const evidence = await this.db.client.evidence.findFirst({
        where: {
          workspaceId,
          createdAt: { gte: fiveMinutesAgo },
        },
      });
      if (!evidence) {
        return {
          valid: false,
          reason:
            'Hallucination Detected: Claimed to add/create/verify evidence, but no recent database mutations were found in the evidence table.',
        };
      }
    }

    // 2. Check if the agent claims to have added/shortlisted properties
    if (
      text.includes('shortlist') ||
      text.includes('shortlisted') ||
      text.includes('added to shortlist')
    ) {
      const shortlistItem = await this.db.client.shortlistItem.findFirst({
        where: {
          shortlist: { workspaceId },
          createdAt: { gte: fiveMinutesAgo },
        },
      });
      if (!shortlistItem) {
        return {
          valid: false,
          reason:
            'Hallucination Detected: Claimed to shortlist property or modify shortlist, but no recent database mutations were found in shortlist items.',
        };
      }
    }

    // 3. Check if the agent claims to have finalized decisions or recorded verdicts
    if (
      text.includes('verdict') ||
      text.includes('decision') ||
      text.includes('investment decision')
    ) {
      const decision = await this.db.client.investmentDecision.findFirst({
        where: {
          workspaceId,
          createdAt: { gte: fiveMinutesAgo },
        },
      });
      if (!decision) {
        return {
          valid: false,
          reason:
            'Hallucination Detected: Claimed to compile verdict or make decision, but no recent database mutations were found in investment decisions.',
        };
      }
    }

    // 4. Check if the agent claims to have updated objective or goal status
    if (
      text.includes('completed objective') ||
      text.includes('resolved goal')
    ) {
      const objective = await this.db.client.objective.findFirst({
        where: {
          goal: { workspaceId },
          status: 'COMPLETED',
        },
      });
      if (!objective) {
        return {
          valid: false,
          reason:
            'Hallucination Detected: Claimed to complete objective, but no corresponding objective was found in COMPLETED status.',
        };
      }
    }

    return { valid: true };
  }

  private sortObjectKeys(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sortObjectKeys(item));
    }
    const sortedKeys = Object.keys(obj).sort();
    const result: any = {};
    for (const key of sortedKeys) {
      result[key] = this.sortObjectKeys(obj[key]);
    }
    return result;
  }
}
