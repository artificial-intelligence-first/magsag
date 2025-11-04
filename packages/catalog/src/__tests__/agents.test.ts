import { describe, expect, it, vi } from 'vitest';

import { agents, skills } from '../index.js';
import type { AgentContext, McpRuntime, RunnerGateway } from '../shared/types.js';

describe('agents.offerOrchestratorMag', () => {
  it('returns aggregated output when SAG succeeds', async () => {
    const runner: RunnerGateway = {
      invokeSagAsync: vi.fn(async () => ({
        taskId: 'task-1',
        status: 'success',
        output: {
          offer: { value: 42 },
          analysis: { summary: { numbers_total: 3 } },
          metadata: { run_id: 'sag-run' }
        } as Record<string, unknown>
      }))
    };

    const context: AgentContext = { runner };
    const result = await agents.offerOrchestratorMag(
      { candidate_profile: { id: '123', role: 'Engineer' } },
      context
    );

    expect(runner.invokeSagAsync).toHaveBeenCalledTimes(1);
    const aggregated = result as Record<string, unknown>;
    const offer = aggregated.offer as Record<string, unknown>;
    const metadata = aggregated.metadata as Record<string, unknown>;
    const aggregates = aggregated.aggregates as Record<string, unknown>;

    expect(offer).toEqual({ value: 42 });
    expect(metadata).toHaveProperty('task_count', 1);
    expect(aggregates).toMatchObject({ numbers_total: 3 });
  });

  it('throws when all delegations fail', async () => {
    const runner: RunnerGateway = {
      invokeSagAsync: vi.fn(async () => ({
        taskId: 'task-1',
        status: 'failure',
        output: {} as Record<string, unknown>
      }))
    };

    await expect(
      agents.offerOrchestratorMag({ candidate_profile: { id: '123' } }, { runner })
    ).rejects.toThrow('All delegations failed');
  });
});

describe('agents.compensationAdvisorSag', () => {
  it('produces deterministic offer data', async () => {
    const result = await agents.compensationAdvisorSag({
      candidate_profile: {
        role: 'Engineer',
        level: 'Senior',
        location: 'San Francisco',
        experience_years: 5
      }
    });
    const output = result as {
      offer: { base_salary: { amount: number } };
      analysis: { summary: { numbers_total: number } };
    };

    expect(output.offer.base_salary.amount).toBeGreaterThan(0);
    expect(output.analysis.summary.numbers_total).toBeGreaterThan(0);
  });
});

describe('skills.resultAggregation', () => {
  it('merges multiple records', async () => {
    const aggregated = await skills.resultAggregation({
      results: [
        { alpha: 1 },
        { beta: 2 }
      ]
    });

    expect(aggregated).toMatchObject({ alpha: 1, beta: 2 });
  });
});

describe('template agents placeholders', () => {
  it('returns placeholder payload for MAG template', async () => {
    const result = await agents.yourOrchestratorMag({ demo: true });
    expect(result).toMatchObject({
      message: expect.stringContaining('yourOrchestratorMag')
    });
  });
});

describe('skills.salaryBandLookup', () => {
  it('coerces numeric strings from Postgres', async () => {
    const runtime: McpRuntime = {
      queryPostgres: vi.fn(async () => ({
        success: true,
        output: {
          rows: [
            {
              currency: 'USD',
              min_salary: '100000',
              max_salary: '150000'
            }
          ]
        }
      }))
    };

    const result = await skills.salaryBandLookup(
      { role: 'Engineer', level: 'Senior', location: 'Remote' },
      { mcp: runtime }
    );

    expect(runtime.queryPostgres).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      currency: 'USD',
      min: 100000,
      max: 150000
    });
  });

  it('rejects non-numeric salary values', async () => {
    const runtime: McpRuntime = {
      queryPostgres: async () => ({
        success: true,
        output: {
          rows: [
            {
              currency: 'USD',
              min_salary: 'not-a-number',
              max_salary: '150000'
            }
          ]
        }
      })
    };

    await expect(
      skills.salaryBandLookup({ role: 'Engineer', level: 'Senior', location: 'Remote' }, { mcp: runtime })
    ).rejects.toThrow(/min_salary/);
  });
});

describe('skills.docGen', () => {
  const templateResult = {
    success: true,
    output: {
      rows: [
        {
          summary_template: 'Summary for {candidate_name}',
          talking_points_template: ['Role: {candidate_role}'],
          default_warnings: [],
          provenance_inputs: [],
          provenance_schemas: {}
        }
      ]
    }
  };

  it('rejects payloads that violate the candidate profile schema', async () => {
    await expect(skills.docGen({})).rejects.toThrow(/doc-gen input validation failed/i);
  });

  it('returns a schema-compliant offer', async () => {
    const runtime: McpRuntime = {
      queryPostgres: async () => templateResult
    };

    const result = await skills.docGen(
      {
        id: 'cand-123',
        role: 'Senior Engineer',
        location: 'Remote',
        salary_band: { min: 120000, max: 150000 }
      },
      { mcp: runtime }
    );

    const offer = (result.offer as Record<string, unknown>) ?? {};
    expect(offer).toMatchObject({
      base_salary: { amount: 120000, currency: 'USD' },
      band: { min: 120000, max: 150000 }
    });
  });

  it('falls back to populated title/seniority when role/level are blank', async () => {
    const runtime: McpRuntime = {
      queryPostgres: async () => templateResult
    };

    const result = await skills.docGen(
      {
        id: 'cand-blank',
        role: '   ',
        title: 'Senior SWE',
        level: '',
        seniority: 'Staff',
        salary_band: { min: 130000, max: 160000 }
      },
      { mcp: runtime }
    );

    const candidate = result.candidate as Record<string, unknown>;
    expect(candidate.role).toBe('Senior SWE');
    expect(candidate.level).toBe('Staff');
  });

  it('emits warning when salary band payload is empty', async () => {
    const runtime: McpRuntime = {
      queryPostgres: async () => templateResult
    };

    const result = await skills.docGen(
      {
        id: 'cand-empty-band',
        role: 'Engineer',
        salary_band: {}
      },
      { mcp: runtime }
    );

    expect(result.warnings).toEqual(
      expect.arrayContaining(['Salary band lookup result not attached.'])
    );
  });
});

describe('skills.supabaseSqlReadonly', () => {
  it('accepts read-only queries with leading comments and CTEs', async () => {
    const runtime: McpRuntime = {
      executeTool: vi.fn(async () => ({ success: true, output: [{ id: 1 }] }))
    };

    const sql = `
      -- fetch recent rows
      /* analytics */
      WITH recent AS (
        SELECT id FROM items WHERE created_at > now() - interval '7 days'
      )
      SELECT * FROM recent;
    `;

    const result = await skills.supabaseSqlReadonly({ sql }, { mcp: runtime });
    expect(runtime.executeTool).toHaveBeenCalledTimes(1);
    expect(result).toHaveProperty('rows');
  });

  it('rejects mutating queries even when comments are present', async () => {
    const runtime: McpRuntime = {
      executeTool: vi.fn(async () => ({ success: true, output: [] }))
    };

    await expect(
      skills.supabaseSqlReadonly(
        {
          sql: `
            /* harmless */ -- still mutating
            UPDATE items SET value = 42;
          `
        },
        { mcp: runtime }
      )
    ).rejects.toThrow(/Only read-only SELECT statements/);
    expect(runtime.executeTool).not.toHaveBeenCalled();
  });

  it('allows literals containing mutating keywords', async () => {
    const runtime: McpRuntime = {
      executeTool: vi.fn(async () => ({ success: true, output: [] }))
    };

    const sql = `
      SELECT
        'do not drop tables' AS note,
        json_build_object('status', 'needs update') AS metadata;
    `;

    await expect(
      skills.supabaseSqlReadonly({ sql }, { mcp: runtime })
    ).resolves.toHaveProperty('rows');
  });

  it('allows double-quoted identifiers containing reserved words', async () => {
    const runtime: McpRuntime = {
      executeTool: vi.fn(async () => ({ success: true, output: [] }))
    };

    const sql = `
      SELECT "update", "DROP", "Grant" FROM audit_log WHERE "select" = true;
    `;

    await expect(
      skills.supabaseSqlReadonly({ sql }, { mcp: runtime })
    ).resolves.toHaveProperty('rows');
  });

  it('allows dollar-quoted strings containing reserved words', async () => {
    const runtime: McpRuntime = {
      executeTool: vi.fn(async () => ({ success: true, output: [] }))
    };

    const sql = `
      SELECT $$DROP TABLE public.users$$ AS note, $tag$grant$tag$ AS label;
    `;

    await expect(
      skills.supabaseSqlReadonly({ sql }, { mcp: runtime })
    ).resolves.toHaveProperty('rows');
  });
});
