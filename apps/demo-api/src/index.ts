import { createServer } from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: unknown;
};

type McpSummary = {
  id: string;
  description?: string;
  transports: string[];
  file: string;
};

type PlanSummary = {
  status: string[];
  planOfWork: string[];
  followUp: string[];
};

const REPO_ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const SERVERS_DIR = join(REPO_ROOT, 'tools', 'adk', 'servers');
const PLAN_PATH = join(
  REPO_ROOT,
  'docs',
  'development',
  'plans',
  'repo-cleanup-execplan.md'
);

const isYamlFile = (file: string): boolean =>
  file.endsWith('.yaml') || file.endsWith('.yml');

const listMcpTransports = (document: unknown): string[] => {
  if (!document || typeof document !== 'object') {
    return [];
  }
  const transports: string[] = [];
  const primary = (document as { transport?: { type?: string } }).transport;
  if (primary && typeof primary === 'object' && 'type' in primary) {
    transports.push(String((primary as { type?: unknown }).type ?? 'unknown'));
  }
  const fallback = Array.isArray((document as { fallback?: unknown }).fallback)
    ? ((document as { fallback?: unknown[] }).fallback ?? [])
    : [];
  for (const entry of fallback) {
    if (entry && typeof entry === 'object' && 'type' in entry) {
      transports.push(String((entry as { type?: unknown }).type ?? 'unknown'));
    }
  }
  return transports;
};

const loadMcpSummaries = async (): Promise<McpSummary[]> => {
  const entries = await readdir(SERVERS_DIR, { withFileTypes: true });
  const results: McpSummary[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !isYamlFile(entry.name)) {
      continue;
    }
    const absolute = join(SERVERS_DIR, entry.name);
    const content = await readFile(absolute, 'utf8');
    const document = yaml.parse(content) as {
      id?: string;
      description?: string;
    };
    if (!document?.id) {
      continue;
    }
    results.push({
      id: document.id,
      description: document.description,
      transports: listMcpTransports(document),
      file: entry.name
    });
  }
  results.sort((a, b) => a.id.localeCompare(b.id));
  return results;
};

const extractSection = (markdown: string, heading: string): string => {
  const headingIndex = markdown.indexOf(heading);
  if (headingIndex === -1) {
    return '';
  }
  const afterHeading = markdown.slice(headingIndex + heading.length);
  const nextHeadingIndex = afterHeading.search(/\n##\s+/);
  if (nextHeadingIndex === -1) {
    return afterHeading;
  }
  return afterHeading.slice(0, nextHeadingIndex);
};

const parseList = (section: string): string[] =>
  section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || /^\d+\./.test(line))
    .map((line) => line.replace(/^[-\d.\s]+/, '').trim())
    .filter((line) => line.length > 0);

const loadPlanSummary = async (): Promise<PlanSummary> => {
  const content = await readFile(PLAN_PATH, 'utf8');
  return {
    status: parseList(extractSection(content, '## Status')),
    planOfWork: parseList(extractSection(content, '## Plan of Work')),
    followUp: parseList(extractSection(content, '## Follow-up'))
  };
};

const respondJson = (
  res: import('node:http').ServerResponse,
  result: HttpResult
): void => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(result.headers ?? {})
  };
  res.writeHead(result.statusCode, headers);
  res.end(JSON.stringify(result.body, null, 2));
};

const router = async (req: import('node:http').IncomingMessage): Promise<HttpResult> => {
  if (req.method !== 'GET') {
    return {
      statusCode: 405,
      headers: { Allow: 'GET' },
      body: { error: 'Method Not Allowed' }
    };
  }

  const url = req.url ?? '/';

  switch (url) {
    case '/':
      return {
        statusCode: 200,
        body: {
          message: 'MAGSAG demo API',
          endpoints: ['/health', '/plan', '/mcp']
        }
      };
    case '/health':
      return {
        statusCode: 200,
        body: { status: 'ok', timestamp: new Date().toISOString() }
      };
    case '/plan':
      return {
        statusCode: 200,
        body: await loadPlanSummary()
      };
    case '/mcp':
      return {
        statusCode: 200,
        body: { servers: await loadMcpSummaries() }
      };
    default:
      return {
        statusCode: 404,
        body: { error: 'Not Found' }
      };
  }
};

const PORT = Number.parseInt(process.env.DEMO_API_PORT ?? '3333', 10);

const server = createServer(async (req, res) => {
  try {
    const result = await router(req);
    respondJson(res, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error occurred.';
    respondJson(res, {
      statusCode: 500,
      body: { error: message }
    });
  }
});

server.listen(PORT, () => {
  console.log(`Demo API listening on http://localhost:${PORT}`);
});
