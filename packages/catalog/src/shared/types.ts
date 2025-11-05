export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface Delegation {
  taskId: string;
  sagId: string;
  input: Record<string, unknown>;
  context?: Record<string, unknown>;
  task_id?: string;
  sag_id?: string;
}

export interface SagInvocationResult {
  taskId: string;
  status: string;
  output: Record<string, unknown>;
}

export interface RunnerGateway {
  invokeSagAsync(delegation: Delegation): Promise<SagInvocationResult>;
}

export interface SkillRegistry {
  exists(id: string): boolean;
  invokeAsync<T = Record<string, unknown>>(id: string, payload: Record<string, unknown>): Promise<T>;
}

export interface Observability {
  runId?: string;
  run_id?: string;
  log?(event: string, payload: Record<string, unknown>): void;
  metric?(name: string, value: number, tags?: Record<string, unknown>): void;
}

import type { McpExecutionContext, McpToolResult } from '@magsag/mcp-client';

export type McpRuntime = McpExecutionContext;
export type { McpToolResult };

export interface SkillContext {
  mcp?: McpRuntime;
  skills?: SkillRegistry;
  obs?: Observability;
}

export interface AgentContext {
  runner?: RunnerGateway;
  obs?: Observability;
  skills?: SkillRegistry;
}
