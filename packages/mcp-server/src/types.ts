import type {
  CallToolResult,
  Implementation,
  ServerNotification,
  ServerRequest,
  ToolAnnotations
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { ZodObject, ZodRawShape } from 'zod';
import type { Logger } from '@magsag/shared-logging';

export interface ToolDefinition {
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly annotations?: ToolAnnotations;
  readonly inputSchema?: ZodObject<ZodRawShape> | ZodRawShape;
  readonly outputSchema?: ZodObject<ZodRawShape> | ZodRawShape;
  readonly handler: ToolHandler;
}

export type ToolHandler = (
  args: Record<string, unknown>,
  extra: RequestHandlerExtra<ServerRequest, ServerNotification>
) => CallToolResult | Promise<CallToolResult>;

export interface McpHttpServerConfig {
  readonly host?: string;
  readonly port: number;
  readonly path?: string;
  readonly allowedHosts?: string[];
  readonly allowedOrigins?: string[];
  readonly enableDnsRebindingProtection?: boolean;
  readonly enableJsonResponse?: boolean;
}

export interface McpSessionConfig {
  readonly idleTimeoutMs?: number;
  readonly cleanupIntervalMs?: number;
}

export interface McpServerRuntimeOptions {
  readonly implementation: Implementation;
  readonly http?: McpHttpServerConfig;
  readonly session?: McpSessionConfig;
  readonly logger?: Logger;
}

export interface HttpServerAddress {
  readonly url: URL;
  readonly host: string;
  readonly port: number;
  readonly path: string;
}
