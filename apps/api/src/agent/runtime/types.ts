import { DatabaseService } from '../../database/database.service';
import { AiGateway } from '@atlas/ai-gateway';

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  requiredTools: string[];
  policies: string[];
  systemInstruction: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  version: string;
  schema?: any; // Zod schema
  handler: (args: any, context: RunContext) => Promise<any>;
}

export interface RunContext {
  workspaceId: string;
  propertyId: string;
  investorProfileId?: string;
  userId?: string;
  jobId: string;
  db: DatabaseService;
  aiGateway: AiGateway;
  runLogs: any[];
  stepTrace: string[];
}

export interface RunVersionInfo {
  agentVersion: string;
  promptVersion: string;
  toolVersions: Record<string, string>;
  policyVersions: Record<string, string>;
}

export interface EvalMetric {
  correctness: number; // 0-100
  toolDiscipline: number; // 0-100
  latencyMs: number;
  cost: number;
  failureRate: number; // 0 or 1
}
