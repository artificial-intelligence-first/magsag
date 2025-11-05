import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type BenchmarkCase = {
  id: string;
  serverId: string;
  toolName: string;
  sampleArgs: Record<string, unknown>;
};

const CASES: BenchmarkCase[] = [
  {
    id: 'skill.doc-gen',
    serverId: 'pg-readonly',
    toolName: 'query',
    sampleArgs: {
      sql: 'SELECT * FROM offer_templates WHERE slug = $1 LIMIT 1',
      params: ['engineering:senior']
    }
  },
  {
    id: 'skill.salary-band-lookup',
    serverId: 'pg-readonly',
    toolName: 'query',
    sampleArgs: {
      sql: 'SELECT min_salary, max_salary FROM salary_bands WHERE role = $1 AND level = $2 LIMIT 1',
      params: ['Engineer', 'Senior']
    }
  },
  {
    id: 'skill.github-issue-triage',
    serverId: 'github',
    toolName: 'list_issues',
    sampleArgs: {
      owner: 'acme',
      repo: 'checkout-service',
      state: 'open',
      labels: ['bug']
    }
  },
  {
    id: 'skill.notion-page-lookup',
    serverId: 'notion',
    toolName: 'retrieve_page',
    sampleArgs: {
      page_id: '11111111-2222-3333-4444-555555555555',
      include_children: true
    }
  },
  {
    id: 'skill.supabase-sql-readonly',
    serverId: 'supabase',
    toolName: 'sql_select',
    sampleArgs: {
      sql: 'SELECT id, email FROM public.users LIMIT 5'
    }
  },
  {
    id: 'skill.obsidian-note-append',
    serverId: 'obsidian',
    toolName: 'append_note',
    sampleArgs: {
      path: 'notes/daily.md',
      content: '# Daily Notes\n- task list'
    }
  }
];

const loadServerDefinition = async (serverId: string): Promise<Record<string, unknown>> => {
  const filePath = path.resolve(__dirname, '../../tools/adk/servers', `${serverId}.yaml`);
  const raw = await readFile(filePath, 'utf8');
  return parse(raw) as Record<string, unknown>;
};

const run = async (): Promise<void> => {
  const cache = new Map<string, Record<string, unknown>>();
  const rows: Array<{
    id: string;
    legacyTokens: number;
    sandboxTokens: number;
    reductionPct: number;
  }> = [];

  for (const testCase of CASES) {
    const server = cache.get(testCase.serverId) ?? (await loadServerDefinition(testCase.serverId));
    cache.set(testCase.serverId, server);

    const legacyTokens = JSON.stringify(server).length;
    const sandboxPayload = {
      serverId: testCase.serverId,
      toolName: testCase.toolName,
      arguments: testCase.sampleArgs
    };
    const sandboxTokens = JSON.stringify(sandboxPayload).length;
    const reductionPct = legacyTokens === 0 ? 0 : (1 - sandboxTokens / legacyTokens) * 100;

    rows.push({
      id: testCase.id,
      legacyTokens,
      sandboxTokens,
      reductionPct
    });
  }

  const legacyTotal = rows.reduce((sum, row) => sum + row.legacyTokens, 0);
  const sandboxTotal = rows.reduce((sum, row) => sum + row.sandboxTokens, 0);
  const overallReduction = legacyTotal === 0 ? 0 : (1 - sandboxTotal / legacyTotal) * 100;

  console.log('MCP Token Usage Benchmark');
  console.log('-----------------------------------------');
  for (const row of rows) {
    console.log(
      `${row.id}: legacy=${row.legacyTokens} new=${row.sandboxTokens} reduction=${row.reductionPct.toFixed(2)}%`
    );
  }
  console.log('-----------------------------------------');
  console.log(
    `Total legacy tokens=${legacyTotal}, sandbox tokens=${sandboxTotal}, reduction=${overallReduction.toFixed(2)}%`
  );
  if (overallReduction < 20) {
    console.warn('WARNING: overall reduction below 20% target');
  }
};

void run().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
