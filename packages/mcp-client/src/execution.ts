import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { InvokeOptions } from './types.js';
import { McpClient } from './mcp-client.js';

export interface McpToolResult<T = unknown> {
  success: boolean;
  output?: T;
  error?: string;
  metadata?: Record<string, unknown>;
}

export interface McpInvokeRequest {
  serverId: string;
  toolName: string;
  args: Record<string, unknown>;
  timeoutMs?: number;
  signal?: AbortSignal;
  cacheKey?: string;
  disableCache?: boolean;
  ttlMs?: number;
}

export interface McpPostgresRequest {
  serverId: string;
  sql: string;
  params?: unknown[];
  timeoutMs?: number;
  signal?: AbortSignal;
  cacheKey?: string;
  disableCache?: boolean;
  ttlMs?: number;
  toolName?: string;
}

export interface McpExecutionContext {
  invokeTool(request: McpInvokeRequest): Promise<McpToolResult>;
  queryPostgres?(request: McpPostgresRequest): Promise<McpToolResult>;
  emitLog?(channel: string, payload: Record<string, unknown>): void;
}

export interface McpToolCallConfig {
  serverId: string;
  toolName: string;
  summary?: string;
  description?: string;
  timeoutMs?: number;
  cacheKey?: string;
  cacheTtlMs?: number;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
}

export interface McpPostgresQueryConfig {
  serverId: string;
  toolName?: string;
  summary?: string;
  description?: string;
  timeoutMs?: number;
  cacheKey?: string;
  cacheTtlMs?: number;
}

export type McpInvocationOptions = InvokeOptions;

const resolveCacheKey = (
  configKey: string | undefined,
  serverId: string,
  toolName: string,
  args: Record<string, unknown>,
  options: InvokeOptions | undefined
): { key?: string; disable: boolean; ttlMs?: number } => {
  const cacheOpt = options?.cache;
  const disable = cacheOpt?.disable ?? false;
  const ttlMs = cacheOpt?.ttlMs;
  if (disable) {
    return { disable, ttlMs: undefined };
  }

  const overrideKey = cacheOpt?.key;
  if (overrideKey) {
    return { key: overrideKey, disable: false, ttlMs };
  }

  if (configKey) {
    return { key: configKey, disable: false, ttlMs }; 
  }

  // Default to no caching when the tool has no explicit cache key.
  return { key: undefined, disable: true, ttlMs: undefined };
};

const emitEvent = (
  ctx: McpExecutionContext,
  channel: string,
  payload: Record<string, unknown>
) => {
  try {
    ctx.emitLog?.(channel, payload);
  } catch {
    // Swallow log propagation failures to avoid impacting tool calls.
  }
};

const resolveTimeout = (
  config: { timeoutMs?: number },
  options: InvokeOptions | undefined
): number | undefined => options?.timeoutMs ?? config.timeoutMs;

const summarizeError = (
  config: { serverId: string; toolName?: string; summary?: string },
  result: McpToolResult
): string => {
  if (result.error) {
    return result.error;
  }
  const label = config.summary ?? config.toolName ?? 'tool';
  return `MCP ${label} call failed for server '${config.serverId}'`;
};

export const callMcpTool = <TArgs extends Record<string, unknown>, TResult>(
  config: McpToolCallConfig
) => {
  return async (
    context: McpExecutionContext,
    args: TArgs,
    options?: InvokeOptions
  ): Promise<TResult> => {
    if (!context || typeof context.invokeTool !== 'function') {
      throw new Error('MCP execution context missing invokeTool implementation.');
    }

    const finalArgs = (args ?? {}) as Record<string, unknown>;
    const { key, disable, ttlMs } = resolveCacheKey(
      config.cacheKey,
      config.serverId,
      config.toolName,
      finalArgs,
      options
    );

    emitEvent(context, 'mcp.tool.invoke', {
      server_id: config.serverId,
      tool: config.toolName,
      cache_key: key,
      cache_disabled: disable,
      summary: config.summary
    });

    const result = await context.invokeTool({
      serverId: config.serverId,
      toolName: config.toolName,
      args: finalArgs,
      timeoutMs: resolveTimeout(config, options),
      signal: options?.signal,
      cacheKey: key,
      disableCache: disable,
      ttlMs: ttlMs ?? config.cacheTtlMs
    });

    if (!result.success) {
      const message = summarizeError(
        { serverId: config.serverId, toolName: config.toolName, summary: config.summary },
        result
      );
      emitEvent(context, 'mcp.tool.error', {
        server_id: config.serverId,
        tool: config.toolName,
        error: message
      });
      throw new Error(message);
    }

    emitEvent(context, 'mcp.tool.success', {
      server_id: config.serverId,
      tool: config.toolName,
      cache_key: key
    });

    return result.output as TResult;
  };
};

export const createPostgresQuery = <TArgs extends Record<string, unknown>, TResult>(
  config: McpPostgresQueryConfig
) => {
  return async (
    context: McpExecutionContext,
    args: TArgs,
    options?: InvokeOptions
  ): Promise<TResult> => {
    const payload = (args ?? {}) as Record<string, unknown> & {
      sql?: string;
      params?: unknown[];
    };

    if (typeof payload.sql !== 'string' || payload.sql.trim().length === 0) {
      throw new Error('PostgreSQL queries require a non-empty sql field.');
    }

    const sql = payload.sql;

    const toolIdentifier = config.toolName ?? 'query';
    const { key, disable, ttlMs } = resolveCacheKey(
      config.cacheKey,
      config.serverId,
      toolIdentifier,
      payload,
      options
    );

    emitEvent(context, 'mcp.postgres.invoke', {
      server_id: config.serverId,
      tool: toolIdentifier,
      cache_key: key,
      summary: config.summary
    });

    const executeQuery = async (): Promise<McpToolResult> => {
      if (context?.queryPostgres) {
        return context.queryPostgres({
          serverId: config.serverId,
          sql,
          params: payload.params,
          timeoutMs: resolveTimeout(config, options),
          signal: options?.signal,
          cacheKey: key,
          disableCache: disable,
          ttlMs: ttlMs ?? config.cacheTtlMs,
          toolName: toolIdentifier
        });
      }
      return context.invokeTool({
        serverId: config.serverId,
        toolName: toolIdentifier,
        args: {
          sql,
          params: payload.params
        },
        timeoutMs: resolveTimeout(config, options),
        signal: options?.signal,
        cacheKey: key,
        disableCache: disable,
        ttlMs: ttlMs ?? config.cacheTtlMs
      });
    };

    const result = await executeQuery();

    if (!result.success) {
      const message = summarizeError(
        { serverId: config.serverId, toolName: toolIdentifier, summary: config.summary },
        result
      );
      emitEvent(context, 'mcp.postgres.error', {
        server_id: config.serverId,
        tool: toolIdentifier,
        error: message
      });
      throw new Error(message);
    }

    emitEvent(context, 'mcp.postgres.success', {
      server_id: config.serverId,
      tool: toolIdentifier,
      cache_key: key
    });

    return result.output as TResult;
  };
};

const extractCallToolOutput = (result: CallToolResult): unknown => {
  const content = Array.isArray(result.content) ? result.content : [];
  for (const item of content) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const record = item as Record<string, unknown>;
    if (record.json !== undefined) {
      return record.json;
    }
    const text = record.text;
    if (typeof text === 'string') {
      try {
        return JSON.parse(text);
      } catch {
        return text;
      }
    }
  }
  if (content.length === 1) {
    return content[0];
  }
  return content.length > 0 ? content : result;
};

const toMcpToolResult = (toolName: string, result: CallToolResult): McpToolResult => {
  const success = result.isError !== true;
  const output = extractCallToolOutput(result);
  return {
    success,
    output: success ? output : undefined,
    error: success
      ? undefined
      : typeof output === 'string'
        ? output
        : `MCP tool ${toolName} failed`,
    metadata: { raw: result }
  };
};

export const createClientExecutionContext = (client: McpClient): McpExecutionContext => ({
  async invokeTool(request) {
    const raw = await client.invokeTool(request.toolName, request.args ?? {}, {
      timeoutMs: request.timeoutMs,
      signal: request.signal,
      cacheKey: request.cacheKey,
      disableCache: request.disableCache,
      ttlMs: request.ttlMs
    });
    return toMcpToolResult(request.toolName, raw);
  },
  async queryPostgres(request) {
    const toolName = request.toolName ?? 'query';
    const raw = await client.invokeTool(toolName, {
      sql: request.sql,
      params: request.params
    }, {
      timeoutMs: request.timeoutMs,
      signal: request.signal,
      cacheKey: request.cacheKey,
      disableCache: request.disableCache,
      ttlMs: request.ttlMs
    });
    return toMcpToolResult(toolName, raw);
  }
});
