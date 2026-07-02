import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class CrossGoalPatternExtractorService {
  constructor(private readonly db: DatabaseService) {}

  async extractPatterns(workspaceId: string): Promise<string[]> {
    if (workspaceId) {
      /* ignore */
    }
    // 1. Fetch historical agent tasks logs
    const tasks = await this.db.client.agentTask.findMany({
      take: 100,
    });

    const commonFailures = new Set<string>();

    const patterns = [
      {
        regex: /zoning\s*delay/i,
        warning: 'Historical zoning delays detected in workspace tasks.',
      },
      {
        regex: /utility\s*connection/i,
        warning: 'Common utility connection challenges observed.',
      },
      {
        regex: /permit\s*delay/i,
        warning: 'Common permit approval delays detected.',
      },
    ];

    for (const task of tasks) {
      for (const logLine of task.logs) {
        for (const pattern of patterns) {
          if (pattern.regex.test(logLine)) {
            commonFailures.add(pattern.warning);
          }
        }
      }
    }

    return Array.from(commonFailures);
  }
}
