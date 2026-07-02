import { AgentDefinition } from './types';
import { BadRequestException } from '@nestjs/common';
import { config } from '../../config';

export class PolicyEngine {
  /**
   * Evaluates if an agent is allowed to execute a specific tool based on its definition and context
   */
  static evaluateToolPolicy(agent: AgentDefinition, toolName: string): void {
    // 1. Tool Permission: Verify the tool is defined in the agent's requiredTools list
    if (!agent.requiredTools.includes(toolName)) {
      throw new BadRequestException(
        `Policy Veto: Agent "${agent.id}" is not permitted to execute tool "${toolName}" (unregistered in requiredTools).`,
      );
    }

    // 2. Environment Restrictions: Limit destructive or simulator actions in production
    const isProd = config.isProduction;
    if (isProd && toolName === 'simulated_delete_action') {
      throw new BadRequestException(
        `Policy Veto: Tool "${toolName}" execution is blocked in production environments.`,
      );
    }
  }

  /**
   * Evaluates if a given run step requires human approval (e.g., Gate A or Gate B checkpoints)
   */
  static requiresApproval(
    agentId: string,
    step: string,
    config?: any,
  ): boolean {
    const requireScreening = config?.requireScreeningApproval !== false;
    const requireMemo = config?.requireMemoApproval !== false;

    if (agentId === 'multi_agent_workflow' && step === 'screening')
      return requireScreening;
    if (agentId === 'multi_agent_workflow' && step === 'memo')
      return requireMemo;
    if (agentId === 'investment_memo') return requireMemo;
    return false;
  }

  /**
   * Evaluates if a given tool execution requires human approval
   */
  static requiresToolApproval(toolName: string, config?: any): boolean {
    const approvalConfig = config?.requireToolApproval || {};

    if (approvalConfig[toolName] !== undefined) {
      return approvalConfig[toolName] === true;
    }

    const highRiskTools = [
      'submit_investment_decision',
      'dispatch_notification',
    ];
    return highRiskTools.includes(toolName);
  }
}
export const POLICY_VERSION = '1.0.0';
export const POLICY_VERSIONS = {
  tool_permissions: POLICY_VERSION,
  env_restrictions: POLICY_VERSION,
  approvals: POLICY_VERSION,
};
