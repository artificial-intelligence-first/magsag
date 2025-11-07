import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '@magsag/mcp-server';

export const createTaskDecompositionTool = (): ToolDefinition => ({
  name: 'skill.task-decomposition',
  title: 'Task Decomposition',
  description: 'Decompose a high-level request into sub-agent tasks.',
  inputSchema: {
    candidate_profile: z.record(z.string(), z.unknown()).optional()
  },
  outputSchema: undefined,
  handler: async (args): Promise<CallToolResult> => {
    const candidateProfile =
      args && typeof args === 'object' && !Array.isArray(args)
        ? (args as { candidate_profile?: unknown }).candidate_profile
        : undefined;

    const normalizedProfile =
      candidateProfile && typeof candidateProfile === 'object'
        ? candidateProfile
        : args && typeof args === 'object'
          ? args
          : {};

    const tasks = [
      {
        sag_id: 'compensation-advisor-sag',
        input: {
          candidate_profile: normalizedProfile ?? {}
        }
      }
    ];

    const textPayload = JSON.stringify(tasks);

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: textPayload
        }
      ]
    };
  }
});
