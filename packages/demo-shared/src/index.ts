import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

export interface McpSummary {
  id: string;
  description?: string;
  transports: string[];
  file: string;
}

export interface PlanSummary {
  status: string[];
  planOfWork: string[];
  followUp: string[];
}

export const REPO_ROOT = resolve(
  fileURLToPath(new URL('../../..', import.meta.url))
);

export const SERVERS_DIR = join(REPO_ROOT, 'tools', 'adk', 'servers');

export const PLAN_PATH = join(
  REPO_ROOT,
  'docs',
  'development',
  'plans',
  'repo-cleanup-execplan.md'
);

const isYamlFile = (file: string): boolean =>
  file.endsWith('.yaml') || file.endsWith('.yml');

export const listMcpTransports = (document: unknown): string[] => {
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
      transports.push(
        String((entry as { type?: unknown }).type ?? 'unknown')
      );
    }
  }
  return transports;
};

export const loadMcpSummaries = async (): Promise<McpSummary[]> => {
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

export const extractSection = (markdown: string, heading: string): string => {
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

export const parseList = (section: string): string[] =>
  section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('-') || /^\d+\./.test(line))
    .map((line) => line.replace(/^[-\d.\s]+/, '').trim())
    .map((line) => line.replace(/^[✅☑️❌✔✗]+\s*/u, '').trim())
    .filter((line) => line.length > 0);

const selectSection = (markdown: string, headings: readonly string[]): string => {
  for (const heading of headings) {
    const section = extractSection(markdown, heading);
    if (section.trim().length > 0) {
      return section;
    }
  }
  return '';
};

export const loadPlanSummary = async (): Promise<PlanSummary> => {
  const content = await readFile(PLAN_PATH, 'utf8');
  return {
    status: parseList(
      selectSection(content, ['## Completion Status', '## Status'])
    ),
    planOfWork: parseList(
      selectSection(content, ['## Workstreams and Tasks', '## Plan of Work'])
    ),
    followUp: parseList(
      selectSection(content, ['## Milestones', '## Follow-up'])
    )
  };
};
