import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';
import { z } from 'zod';
import { randomUUID } from 'crypto';

export const CompiledObjectiveSchema = z.object({
  id: z.string(),
  title: z.string(),
  dependencies: z.array(z.string()),
  criteria: z.any(),
});

export const CompiledGoalSchema = z.object({
  title: z.string(),
  description: z.string(),
  objectives: z.array(CompiledObjectiveSchema),
});

export type CompiledGoal = z.infer<typeof CompiledGoalSchema>;

@Injectable()
export class GoalService {
  private readonly aiGateway: AiGateway;

  constructor(private readonly db: DatabaseService) {
    this.aiGateway = new AiGateway();
  }

  async compileGoal(workspaceId: string, goalText: string): Promise<any> {
    const isSim = this.aiGateway.isSimulationMode();
    let compiled: CompiledGoal;

    if (isSim) {
      compiled = this.simulateGoalCompilation(goalText);
    } else {
      const prompt = `Compile the following natural language goal into a structured dependency DAG objective tree:
Goal: "${goalText}"

Return the JSON matching the schema containing:
- title: A concise name of the goal
- description: Full goal statement
- objectives: An array of steps with ids, titles, dependecy ids, and criteria JSON.`;

      const systemInstruction = `You are an AI Goal Compiler. Decompose user requests into a flat list of dependency-mapped objectives forming a directed acyclic graph (DAG).`;

      try {
        compiled = await this.aiGateway.generateStructuredJson<CompiledGoal>(
          prompt,
          CompiledGoalSchema,
          systemInstruction,
        );
      } catch (err: any) {
        throw new BadRequestException(
          `Goal compilation failed: ${err.message}`,
        );
      }
    }

    // Check for cycles in compiled objectives
    if (this.hasDependencyCycles(compiled.objectives)) {
      throw new BadRequestException(
        'Acyclic DAG violation: Detected circular dependency loops in compiled objectives.',
      );
    }

    // Persist Goal
    const goal = await this.db.client.goal.create({
      data: {
        workspaceId,
        title: compiled.title,
        description: compiled.description,
        status: 'PENDING',
        executionTree: compiled as any,
      },
    });

    // Map custom compiler IDs (e.g. 'step-1') to actual database UUIDs
    const idMap = new Map<string, string>();
    for (const obj of compiled.objectives) {
      idMap.set(obj.id, randomUUID());
    }

    // Create Objectives
    for (const obj of compiled.objectives) {
      const dbId = idMap.get(obj.id)!;
      const dbDeps = (obj.dependencies || []).map(
        (depId: string) => idMap.get(depId) || depId,
      );

      await this.db.client.objective.create({
        data: {
          id: dbId,
          goalId: goal.id,
          title: obj.title,
          status: 'PENDING',
          criteriaJson: obj.criteria || {},
          dependencies: dbDeps,
        },
      });
    }

    return goal;
  }

  async getGoalDetails(workspaceId: string, goalId: string) {
    const goal = await this.db.client.goal.findFirst({
      where: { id: goalId, workspaceId },
      include: { objectives: true },
    });
    if (!goal) {
      throw new NotFoundException(`Goal ${goalId} not found in workspace.`);
    }
    return goal;
  }

  // Backtracking state management: when an objective status updates
  async updateObjectiveStatus(
    workspaceId: string,
    goalId: string,
    objectiveId: string,
    status: 'COMPLETED' | 'FAILED' | 'RUNNING',
  ) {
    const goal = await this.db.client.goal.findFirst({
      where: { id: goalId, workspaceId },
    });
    if (!goal) {
      throw new NotFoundException(`Goal not found.`);
    }

    await this.db.client.objective.update({
      where: { id: objectiveId },
      data: { status },
    });

    // Run backtracking & propagation
    await this.propagateTreeState(goalId);

    return this.getGoalDetails(workspaceId, goalId);
  }

  private async propagateTreeState(goalId: string): Promise<void> {
    const objectives = await this.db.client.objective.findMany({
      where: { goalId },
    });

    const failedIds = objectives
      .filter((o) => o.status === 'FAILED' || o.status === 'BLOCKED')
      .map((o) => o.id);
    let updated = false;

    // Propagate FAILED dependencies to set dependent objectives as BLOCKED
    for (const obj of objectives) {
      if (obj.status === 'PENDING' || obj.status === 'RUNNING') {
        const hasFailedDep = obj.dependencies.some((depId) =>
          failedIds.includes(depId),
        );
        if (hasFailedDep) {
          await this.db.client.objective.update({
            where: { id: obj.id },
            data: { status: 'BLOCKED' },
          });
          updated = true;
        }
      }
    }

    if (updated) {
      // Re-run if states shifted
      return this.propagateTreeState(goalId);
    }

    // Check goal overall status
    const freshObjectives = await this.db.client.objective.findMany({
      where: { goalId },
    });

    const allCompleted = freshObjectives.every((o) => o.status === 'COMPLETED');
    const anyFailed = freshObjectives.some(
      (o) => o.status === 'FAILED' || o.status === 'BLOCKED',
    );

    let goalStatus = 'RUNNING';
    if (allCompleted) {
      goalStatus = 'COMPLETED';
    } else if (anyFailed) {
      goalStatus = 'FAILED';
    }

    await this.db.client.goal.update({
      where: { id: goalId },
      data: { status: goalStatus },
    });
  }

  private hasDependencyCycles(objectives: any[]): boolean {
    const adjList = new Map<string, string[]>();
    for (const obj of objectives) {
      adjList.set(obj.id, obj.dependencies || []);
    }

    const visited = new Set<string>();
    const recStack = new Set<string>();

    const dfs = (node: string): boolean => {
      if (recStack.has(node)) return true;
      if (visited.has(node)) return false;

      visited.add(node);
      recStack.add(node);

      const neighbors = adjList.get(node) || [];
      for (const neighbor of neighbors) {
        if (dfs(neighbor)) return true;
      }

      recStack.delete(node);
      return false;
    };

    for (const obj of objectives) {
      if (dfs(obj.id)) return true;
    }
    return false;
  }

  private simulateGoalCompilation(goalText: string): CompiledGoal {
    return {
      title: 'Simulated Real Estate Goal Plan',
      description: goalText,
      objectives: [
        {
          id: 'step-1',
          title: 'Screen target assets in submarket matching yield constraints',
          dependencies: [],
          criteria: { minYield: 0.07 },
        },
        {
          id: 'step-2',
          title:
            'Run diligence document verification pipeline on qualified assets',
          dependencies: ['step-1'],
          criteria: { verifyLeases: true },
        },
        {
          id: 'step-3',
          title: 'Draft investment advisory memo to the committee',
          dependencies: ['step-2'],
          criteria: { includeObjections: true },
        },
      ],
    };
  }
}
