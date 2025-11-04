import { McpServerRuntime } from './runtime.js';
import type { McpServerRuntimeOptions } from './types.js';

export { McpServerRuntime } from './runtime.js';
export { ToolRegistry } from './tool-registry.js';
export type {
  HttpServerAddress,
  McpHttpServerConfig,
  McpServerRuntimeOptions,
  McpSessionConfig,
  ToolDefinition,
  ToolHandler
} from './types.js';

export const createMcpServerRuntime = (options: McpServerRuntimeOptions): McpServerRuntime =>
  new McpServerRuntime(options);
