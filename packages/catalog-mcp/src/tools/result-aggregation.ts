import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '@magsag/mcp-server';

const resultsSchema = z.array(z.record(z.string(), z.unknown())).optional();

export const createResultAggregationTool = (): ToolDefinition => ({
  name: 'skill.result-aggregation',
  title: 'Result Aggregation',
  description: 'Aggregate results from multiple sub-agents.',
  inputSchema: {
    results: resultsSchema
  },
  handler: async (args): Promise<CallToolResult> => {
    const resultList = Array.isArray(args.results) ? args.results : [];

    let aggregated: Record<string, unknown> = {};

    if (resultList.length === 0) {
      aggregated = {};
    } else if (resultList.length === 1) {
      const single = resultList[0];
      aggregated =
        single && typeof single === 'object' && !Array.isArray(single)
          ? (single as Record<string, unknown>)
          : {};
    } else {
      aggregated = resultList.reduce<Record<string, unknown>>((acc, entry) => {
        if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          Object.assign(acc, entry as Record<string, unknown>);
        }
        return acc;
      }, {});
    }

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(aggregated)
        }
      ]
    };
  }
});
