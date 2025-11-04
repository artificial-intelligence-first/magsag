import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { ToolDefinition } from '@magsag/mcp-server';

const numbersSchema = z
  .union([z.array(z.number()), z.number(), z.array(z.unknown()), z.unknown()])
  .optional();

export const createTestHelperTransformTool = (): ToolDefinition => ({
  name: 'skill.test-helper-transform',
  title: 'Test Helper Transform',
  description: 'Deterministic transformations for testing pipelines.',
  inputSchema: {
    text: z.string().optional(),
    value: z.union([z.number(), z.string()]).optional(),
    numbers: numbersSchema
  },
  handler: async (args): Promise<CallToolResult> => {
    const textValue = typeof args.text === 'string' ? args.text : String(args.text ?? '');
    const numericValue = Number.isFinite(Number(args.value)) ? Number(args.value) : 0;

    const rawNumbers = args.numbers;
    const collected = collectNumbers(rawNumbers);

    const transformed = {
      upper_text: textValue.toUpperCase(),
      value_squared: numericValue * numericValue,
      numbers_doubled: collected.map((value) => value * 2),
      numbers_total: collected.reduce((acc, value) => acc + value, 0),
      source: 'skill.test-helper-transform'
    } satisfies Record<string, unknown>;

    return {
      isError: false,
      content: [
        {
          type: 'text',
          text: JSON.stringify(transformed)
        }
      ]
    };
  }
});

const collectNumbers = (value: unknown): number[] => {
  if (value == null) {
    return [];
  }
  if (Array.isArray(value)) {
    return value
      .map((entry) => toNumber(entry))
      .filter((entry): entry is number => typeof entry === 'number');
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') {
    const numeric = toNumber(value);
    return typeof numeric === 'number' ? [numeric] : [];
  }
  if (typeof value === 'object' && Symbol.iterator in value) {
    const result: number[] = [];
    for (const entry of value as Iterable<unknown>) {
      const numeric = toNumber(entry);
      if (typeof numeric === 'number') {
        result.push(numeric);
      }
    }
    return result;
  }
  return [];
};

const toNumber = (value: unknown): number | undefined => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === 'bigint') {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
};
