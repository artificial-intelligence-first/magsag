import { readFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'yaml';

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

const printMcpSummary = async (): Promise<void> => {
  const summaries = await loadMcpSummaries();
  if (summaries.length === 0) {
    console.log('No MCP presets found under tools/adk/servers.');
    return;
  }
  console.log('MCP presets found:');
  for (const summary of summaries) {
    const description = summary.description ? ` — ${summary.description}` : '';
    const transports =
      summary.transports.length > 0
        ? summary.transports.join(', ')
        : 'unknown';
    console.log(`  • ${summary.id}${description}`);
    console.log(`    transports: ${transports}`);
    console.log(`    file: ${summary.file}`);
  }
};

const printPlanSummary = async (): Promise<void> => {
  const summary = await loadPlanSummary();
  console.log('Repository Cleanup ExecPlan snapshot:');
  if (summary.status.length > 0) {
    console.log('  Status updates:');
    summary.status.forEach((line) => console.log(`    - ${line}`));
  }
  if (summary.planOfWork.length > 0) {
    console.log('  Plan of work:');
    summary.planOfWork.forEach((line, index) =>
      console.log(`    ${index + 1}. ${line}`)
    );
  }
  if (summary.followUp.length > 0) {
    console.log('  Follow-up items:');
    summary.followUp.forEach((line) => console.log(`    - ${line}`));
  }
};

const printHelp = (): void => {
  console.log('Usage: magsag-demo-cli <command>');
  console.log('');
  console.log('Commands:');
  console.log('  mcp   Show available MCP presets and transports');
  console.log('  plan  Summarise the repository cleanup ExecPlan');
};

const main = async (): Promise<void> => {
  const [command] = process.argv.slice(2);
  try {
    switch (command) {
      case 'mcp':
        await printMcpSummary();
        break;
      case 'plan':
        await printPlanSummary();
        break;
      case undefined:
        printHelp();
        break;
      default:
        console.error(`Unknown command '${command}'.`);
        printHelp();
        process.exitCode = 1;
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error occurred.';
    console.error(message);
    process.exitCode = 1;
  }
};

main();
