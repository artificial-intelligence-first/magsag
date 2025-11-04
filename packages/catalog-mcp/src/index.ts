import type { ToolDefinition } from '@magsag/mcp-server';
import {
  createDocGenPlaceholderTool,
  createExampleWebSearchPlaceholderTool,
  createGithubIssueTriagePlaceholderTool,
  createNotionPageLookupPlaceholderTool,
  createObsidianNoteAppendPlaceholderTool,
  createSalaryBandLookupPlaceholderTool,
  createSupabaseSqlReadonlyPlaceholderTool
} from './tools/placeholders.js';
import { createResultAggregationTool } from './tools/result-aggregation.js';
import { createTaskDecompositionTool } from './tools/task-decomposition.js';
import { createTestHelperTransformTool } from './tools/test-helper-transform.js';

export interface LoadCatalogToolsOptions {
  repoPath: string;
}

export const loadCatalogTools = async ({ repoPath }: LoadCatalogToolsOptions): Promise<ToolDefinition[]> => {
  void repoPath;
  const tools: ToolDefinition[] = [
    createTaskDecompositionTool(),
    createResultAggregationTool(),
    createTestHelperTransformTool(),
    ...createPlaceholderTools()
  ];

  return tools;
};

const createPlaceholderTools = (): ToolDefinition[] => [
  createDocGenPlaceholderTool(),
  createGithubIssueTriagePlaceholderTool(),
  createNotionPageLookupPlaceholderTool(),
  createObsidianNoteAppendPlaceholderTool(),
  createSalaryBandLookupPlaceholderTool(),
  createSupabaseSqlReadonlyPlaceholderTool(),
  createExampleWebSearchPlaceholderTool()
];
