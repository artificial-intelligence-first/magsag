import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '@magsag/mcp-server';

const createPlaceholderHandler = (name: string): (() => Promise<CallToolResult>) => {
  return async () => ({
    isError: true,
    content: [
      {
        type: 'text',
        text: `Tool '${name}' is waiting for the TypeScript MCP runtime migration.`
      }
    ]
  });
};

export const createPlaceholderTool = (name: string, title: string, description: string): ToolDefinition => ({
  name,
  title,
  description,
  inputSchema: {},
  handler: createPlaceholderHandler(name)
});

export const createDocGenPlaceholderTool = (): ToolDefinition =>
  createPlaceholderTool(
    'skill.doc-gen',
    'Offer Packet Generation',
    'Generates offer packets; pending TypeScript MCP runtime migration.'
  );

export const createGithubIssueTriagePlaceholderTool = (): ToolDefinition =>
  createPlaceholderTool(
    'skill.github-issue-triage',
    'GitHub Issue Triage',
    'Triages GitHub issues; pending TypeScript MCP runtime migration.'
  );

export const createNotionPageLookupPlaceholderTool = (): ToolDefinition =>
  createPlaceholderTool(
    'skill.notion-page-lookup',
    'Notion Page Lookup',
    'Fetches Notion pages; pending TypeScript MCP runtime migration.'
  );

export const createObsidianNoteAppendPlaceholderTool = (): ToolDefinition =>
  createPlaceholderTool(
    'skill.obsidian-note-append',
    'Obsidian Note Append',
    'Appends content to Obsidian notes; pending TypeScript MCP runtime migration.'
  );

export const createSalaryBandLookupPlaceholderTool = (): ToolDefinition =>
  createPlaceholderTool(
    'skill.salary-band-lookup',
    'Salary Band Lookup',
    'Looks up salary bands via Postgres; pending TypeScript MCP runtime migration.'
  );

export const createSupabaseSqlReadonlyPlaceholderTool = (): ToolDefinition =>
  createPlaceholderTool(
    'skill.supabase-sql-readonly',
    'Supabase SQL Readonly',
    'Executes read-only SQL against Supabase; pending TypeScript MCP runtime migration.'
  );

export const createExampleWebSearchPlaceholderTool = (): ToolDefinition =>
  createPlaceholderTool(
    'skill.example-web-search',
    'Example Web Search',
    'Demonstration web-search skill; pending TypeScript MCP runtime migration.'
  );
