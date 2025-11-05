import { query, type QueryArgs, type QueryResult } from '@magsag/servers/pg-readonly';
import { SkillContext, McpRuntime } from '../shared/types.js';

const SALARY_QUERY = `
SELECT currency, min_salary, max_salary
FROM salary_bands
WHERE role = $1 AND level = $2 AND location = $3
LIMIT 1
`;

const ensureRuntime = (context: SkillContext): McpRuntime => {
  if (!context.mcp) {
    throw new Error(
      "salary-band-lookup requires an MCP runtime with access to the 'pg-readonly' server."
    );
  }
  return context.mcp;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;

const toFiniteNumber = (value: unknown, field: string): number => {
  if (value === undefined || value === null) {
    throw new Error(`Salary band record is missing ${field} field.`);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${field} must be a finite number`);
    }
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new Error(`Salary band record is missing ${field} field.`);
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      throw new Error(`${field} must be a finite number`);
    }
    return parsed;
  }
  throw new Error(`${field} must be numeric`);
};

const ensureResult = (result: QueryResult): Record<string, unknown> => {
  const rows = Array.isArray(result.rows) ? result.rows : [];
  const firstRow = asRecord(rows?.[0]);
  if (!firstRow) {
    throw new Error(
      'No salary band found for the supplied role/level/location in the salary_bands table.'
    );
  }
  return firstRow;
};

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  const role = String(payload.role ?? '');
  const level = String(payload.level ?? '');
  const location = String(payload.location ?? '');

  const runtime = ensureRuntime(context);
  const result = await query(runtime, {
    sql: SALARY_QUERY,
    params: [role, level, location]
  } satisfies QueryArgs);

  const row = ensureResult(result);
  const currency = typeof row.currency === 'string' ? row.currency : 'USD';
  const minSalary = toFiniteNumber(row.min_salary, 'min_salary');
  const maxSalary = toFiniteNumber(row.max_salary, 'max_salary');

  return {
    currency,
    min: minSalary,
    max: maxSalary,
    source: 'database'
  };
};
