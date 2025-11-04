import { SkillContext, McpRuntime, McpToolResult } from '../shared/types.js';

const READ_ONLY_PREFIX = /^(select|with)\b/i;
const MUTATING_KEYWORDS = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke)\b/i;

const ensureRuntime = (context: SkillContext): McpRuntime => {
  if (!context.mcp) {
    throw new Error("supabase-sql-readonly requires an MCP runtime with the 'supabase' server.");
  }
  return context.mcp;
};

const validateParams = (value: unknown): void => {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    throw new Error('supabase_sql_readonly_input.params must be an array');
  }
  for (const item of value) {
    const type = typeof item;
    if (!['string', 'number', 'boolean'].includes(type) && item !== null) {
      throw new Error('supabase_sql_readonly_input.params must contain scalar JSON values');
    }
  }
};

const stripLeadingComments = (sql: string): string => {
  let remaining = sql;
  while (true) {
    remaining = remaining.trimStart();
    if (remaining.startsWith('--')) {
      const newlineIndex = remaining.indexOf('\n');
      if (newlineIndex === -1) {
        return '';
      }
      remaining = remaining.slice(newlineIndex + 1);
      continue;
    }
    if (remaining.startsWith('/*')) {
      const endIndex = remaining.indexOf('*/', 2);
      if (endIndex === -1) {
        return '';
      }
      remaining = remaining.slice(endIndex + 2);
      continue;
    }
    break;
  }
  return remaining;
};

const removeSqlComments = (sql: string): string => {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--.*$/gm, ' ');
};

const stripQuotedSegments = (sql: string): string => {
  let result = '';
  let index = 0;

  while (index < sql.length) {
    const char = sql[index];

    if (char === "'") {
      const start = index;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === "'" && sql[index + 1] === "'") {
          index += 2;
          continue;
        }
        if (sql[index] === "'") {
          index += 1;
          break;
        }
        index += 1;
      }
      result += ' '.repeat(index - start);
      continue;
    }

    if (char === '"') {
      const start = index;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '"' && sql[index + 1] === '"') {
          index += 2;
          continue;
        }
        if (sql[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      result += ' '.repeat(index - start);
      continue;
    }

    if (char === '$') {
      const match = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(index));
      if (match) {
        const delimiter = match[0];
        const start = index;
        index += delimiter.length;
        const closingIndex = sql.indexOf(delimiter, index);
        if (closingIndex === -1) {
          result += ' '.repeat(sql.length - start);
          return result;
        }
        index = closingIndex + delimiter.length;
        result += ' '.repeat(index - start);
        continue;
      }
    }

    result += char;
    index += 1;
  }

  return result;
};

const validateSql = (sql: string): void => {
  const leading = stripLeadingComments(sql);
  if (leading.trim().length === 0 || !READ_ONLY_PREFIX.test(leading.trimStart())) {
    throw new Error('Only read-only SELECT statements are permitted for Supabase read-only skill');
  }
  const sanitized = stripQuotedSegments(removeSqlComments(sql));
  if (MUTATING_KEYWORDS.test(sanitized)) {
    throw new Error('Mutating SQL statements are not permitted for Supabase read-only skill');
  }
};

const ensureSuccess = (result: McpToolResult | undefined): McpToolResult => {
  if (!result || !result.success) {
    throw new Error(result?.error ?? 'Supabase sql_select failed');
  }
  return result;
};

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  if (typeof payload.sql !== 'string' || payload.sql.trim().length === 0) {
    throw new Error('supabase_sql_readonly_input.sql must be a non-empty string');
  }

  validateParams(payload.params);

  const sql = payload.sql.trim();
  validateSql(sql);

  const runtime = ensureRuntime(context);
  const result = await runtime.executeTool?.({
    serverId: 'supabase',
    toolName: 'sql_select',
    arguments: {
      sql,
      ...(payload.params !== undefined ? { params: payload.params } : {})
    }
  });

  const success = ensureSuccess(result);
  return {
    rows: success.output
  };
};
