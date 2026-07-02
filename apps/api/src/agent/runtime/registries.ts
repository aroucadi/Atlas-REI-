import { AgentDefinition, ToolDefinition } from './types';

export class AgentRegistry {
  private static agents = new Map<string, AgentDefinition>();

  static register(agent: AgentDefinition) {
    this.agents.set(agent.id, agent);
  }

  static get(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  static list(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  static clear() {
    this.agents.clear();
  }
}

export class ToolRegistry {
  private static tools = new Map<string, ToolDefinition>();

  static register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  static get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  static list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  static clear() {
    this.tools.clear();
  }
}
