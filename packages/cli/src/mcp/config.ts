import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import yaml from 'yaml';
import { z } from 'zod';
import type {
  HttpTransportConfig,
  SseTransportConfig,
  StdioTransportConfig,
  TransportConfig,
  WebSocketTransportConfig
} from '@magsag/mcp-client';

const transportSchema = z.discriminatedUnion('type', [
    z
      .object({
        type: z.literal('http'),
        url: z.string(),
        headers: z.record(z.string()).optional(),
        timeoutSeconds: z.number().nonnegative().optional()
      })
      .passthrough(),
    z
      .object({
        type: z.literal('sse'),
        url: z.string(),
        headers: z.record(z.string()).optional()
      })
      .passthrough(),
    z
      .object({
        type: z.literal('websocket'),
        url: z.string(),
        headers: z.record(z.string()).optional()
      })
      .passthrough(),
    z
      .object({
        type: z.literal('stdio'),
        command: z.string(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string()).optional(),
        cwd: z.string().optional(),
        stderr: z.enum(['inherit', 'pipe', 'ignore']).optional()
      })
      .passthrough()
  ]);

const serverSchema = z
  .object({
    id: z.string(),
    version: z.union([z.string(), z.number()]).optional(),
    description: z.string().optional(),
    transport: transportSchema,
    fallback: z.array(transportSchema).optional()
  })
  .passthrough();

type RawTransport = z.infer<typeof transportSchema>;

export interface McpTransportEntry {
  readonly type: TransportConfig['type'];
  readonly label: string;
  readonly config: TransportConfig;
}

export interface McpServerDefinition {
  readonly id: string;
  readonly version?: string | number;
  readonly description?: string;
  readonly filePath: string;
  readonly transports: McpTransportEntry[];
}

const SERVERS_DIR = join(process.cwd(), 'ops', 'adk', 'servers');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const expandTemplate = (value: string, depth = 0): string => {
  if (depth > 5) {
    return value;
  }
  return value.replace(/\$\{([^}]+)\}/g, (_, expression: string) => {
    const expanded = evaluateExpression(expression, depth + 1);
    return expanded ?? '';
  });
};

const evaluateExpression = (expression: string, depth: number): string | undefined => {
  const plusIndex = expression.indexOf(':+');
  if (plusIndex !== -1) {
    const variable = expression.slice(0, plusIndex);
    const remainder = expression.slice(plusIndex + 2);
    const value = process.env[variable];
    if (value && value.length > 0) {
      return expandTemplate(remainder, depth);
    }
    return '';
  }

  const minusIndex = expression.indexOf(':-');
  if (minusIndex !== -1) {
    const variable = expression.slice(0, minusIndex);
    const remainder = expression.slice(minusIndex + 2);
    const value = process.env[variable];
    if (value && value.length > 0) {
      return value;
    }
    return expandTemplate(remainder, depth);
  }

  const variable = expression.trim();
  return process.env[variable] ?? '';
};

const expandValue = <T>(value: T): T => {
  if (typeof value === 'string') {
    return expandTemplate(value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => expandValue(item)) as T;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, expandValue(entry)])
    ) as T;
  }
  return value;
};

const toHttpConfig = (raw: RawTransport & { type: 'http' }): HttpTransportConfig => {
  const expanded = expandValue(raw) as RawTransport & { type: 'http' };
  const headers = expanded.headers && typeof expanded.headers === 'object'
    ? Object.fromEntries(
        Object.entries(expanded.headers as Record<string, unknown>).map(([key, entry]) => [
          key,
          String(entry)
        ])
      )
    : undefined;
  const timeoutCandidate = expanded.timeoutSeconds;
  const timeoutValue =
    typeof timeoutCandidate === 'number'
      ? timeoutCandidate
      : typeof timeoutCandidate === 'string'
        ? Number(timeoutCandidate)
        : undefined;
  const timeoutSeconds =
    typeof timeoutValue === 'number' && Number.isFinite(timeoutValue) && timeoutValue >= 0
      ? timeoutValue
      : undefined;
  return {
    type: 'http',
    url: expanded.url,
    headers,
    timeoutSeconds
  };
};

const toSseConfig = (raw: RawTransport & { type: 'sse' }): SseTransportConfig => {
  const expanded = expandValue(raw) as RawTransport & { type: 'sse' };
  const headers = expanded.headers && typeof expanded.headers === 'object'
    ? Object.fromEntries(
        Object.entries(expanded.headers as Record<string, unknown>).map(([key, entry]) => [
          key,
          String(entry)
        ])
      )
    : undefined;

  return {
    type: 'sse',
    url: expanded.url,
    headers
  };
};

const toWebSocketConfig = (
  raw: RawTransport & { type: 'websocket' }
): WebSocketTransportConfig => {
  const expanded = expandValue(raw) as RawTransport & { type: 'websocket' };
  const headers = expanded.headers && typeof expanded.headers === 'object'
    ? Object.fromEntries(
        Object.entries(expanded.headers as Record<string, unknown>).map(([key, entry]) => [
          key,
          String(entry)
        ])
      )
    : undefined;
  return {
    type: 'websocket',
    url: expanded.url,
    headers
  };
};

const toStdioConfig = (raw: RawTransport & { type: 'stdio' }): StdioTransportConfig => {
  const expanded = expandValue(raw) as RawTransport & { type: 'stdio' };
  const env = expanded.env && typeof expanded.env === 'object'
    ? Object.fromEntries(
        Object.entries(expanded.env as Record<string, unknown>)
          .map(([key, entry]) => [key, String(entry)])
          .filter(([, entry]) => entry.length > 0)
      )
    : undefined;
  return {
    type: 'stdio',
    command: expanded.command,
    args: Array.isArray(expanded.args) ? expanded.args.map(String) : undefined,
    env,
    cwd: typeof expanded.cwd === 'string' ? expanded.cwd : undefined,
    stderr:
      expanded.stderr === 'inherit' || expanded.stderr === 'pipe' || expanded.stderr === 'ignore'
        ? expanded.stderr
        : undefined
  };
};

const toTransportConfig = (raw: RawTransport): TransportConfig => {
  switch (raw.type) {
    case 'http':
      return toHttpConfig(raw);
    case 'sse':
      return toSseConfig(raw);
    case 'websocket':
      return toWebSocketConfig(raw);
    case 'stdio':
      return toStdioConfig(raw);
    default:
      throw new Error(`Unsupported MCP transport type: ${(raw as { type: unknown }).type}`);
  }
};

const buildTransportEntry = (raw: RawTransport): McpTransportEntry => {
  const config = toTransportConfig(raw);
  const label =
    config.type === 'stdio'
      ? `STDIO ${(config as StdioTransportConfig).command}`
      : `${config.type.toUpperCase()} ${config.url}`;
  return {
    type: config.type,
    label,
    config
  };
};

const parseServerFile = async (filePath: string): Promise<McpServerDefinition | undefined> => {
  const rawContent = await fs.readFile(filePath, 'utf8');
  const document = yaml.parse(rawContent);

  if (!isRecord(document)) {
    throw new Error(`Failed to parse MCP server preset ${filePath}: document must be an object`);
  }

  const declaredType = typeof document.type === 'string' ? document.type.trim() : undefined;
  if (declaredType && declaredType.length > 0 && declaredType !== 'mcp') {
    return undefined;
  }

  const parsed = serverSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(
      `Failed to parse MCP server preset ${filePath}: ${parsed.error.flatten().formErrors.join(', ')}`
    );
  }

  const primary = buildTransportEntry(parsed.data.transport);
  const fallback = (parsed.data.fallback ?? []).map((entry) => buildTransportEntry(entry));
  return {
    id: parsed.data.id,
    version: parsed.data.version,
    description: parsed.data.description,
    filePath,
    transports: [primary, ...fallback]
  };
};

const isMissingDirectory = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const code = (error as { code?: unknown }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
};

export const loadMcpServerDefinitions = async (
  directory: string = SERVERS_DIR
): Promise<McpServerDefinition[]> => {
  const absoluteDir = resolve(directory);
  let entries: Dirent[] = [];
  try {
    entries = await fs.readdir(absoluteDir, { withFileTypes: true });
  } catch (error) {
    if (isMissingDirectory(error)) {
      return [];
    }
    throw error;
  }

  const definitions: McpServerDefinition[] = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }
    if (!entry.name.endsWith('.yaml') && !entry.name.endsWith('.yml')) {
      continue;
    }
    const filePath = join(absoluteDir, entry.name);
    const definition = await parseServerFile(filePath);
    if (definition) {
      definitions.push(definition);
    }
  }

  definitions.sort((a, b) => a.id.localeCompare(b.id));
  return definitions;
};

export const findMcpServerDefinition = async (
  serverId: string,
  directory: string = SERVERS_DIR
): Promise<McpServerDefinition | undefined> => {
  const definitions = await loadMcpServerDefinitions(directory);
  return definitions.find((definition) => definition.id === serverId);
};
