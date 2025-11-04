import { z } from 'zod';
import { ENGINE_IDS, ENGINE_ENV, type EngineId } from '@magsag/core';

const ENGINE_ID_LITERALS = [...ENGINE_IDS] as [EngineId, ...EngineId[]];
const ENGINE_MODE_LITERALS = ['auto', 'subscription', 'api', 'oss'] as const;

export const engineIdSchema = z.enum(ENGINE_ID_LITERALS);

export const engineModeSchema = z.enum(ENGINE_MODE_LITERALS);

const mcpRuntimeSchema = z.object({
  url: z.string().min(1, 'MCP runtime URL is required.'),
  host: z.string().min(1, 'MCP runtime host is required.'),
  port: z.number().int().nonnegative(),
  path: z.string().min(1, 'MCP runtime path is required.')
});

const mcpMetadataSchema = z.object({
  runtime: mcpRuntimeSchema,
  tools: z.array(z.string().min(1)).optional()
});

const runSpecExtraSchema = z
  .object({
    mcp: mcpMetadataSchema.optional()
  })
  .catchall(z.unknown());

export const runSpecSchema = z.object({
  engine: engineIdSchema,
  repo: z.string().min(1, 'Repository path is required.'),
  prompt: z.string().min(1, 'Prompt is required.'),
  resumeId: z.string().min(1).optional(),
  extra: runSpecExtraSchema.optional()
});

export type RunSpecInput = z.infer<typeof runSpecSchema>;

export const engineSelectionSchema = z.object({
  mode: engineModeSchema,
  mag: engineIdSchema,
  sag: engineIdSchema
});

export type EngineSelectionInput = z.infer<typeof engineSelectionSchema>;

const nonEmptyString = (message: string) => z.string().min(1, message);

const isoTimestampSchema = z
  .string()
  .min(1)
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: 'Expected ISO 8601 timestamp'
  });


export const policyRoleSchema = z.enum(['mag', 'sag', 'observer']);

export const permissionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  required: z.boolean().default(false)
});

export const policySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  version: z.string().min(1),
  roles: z
    .array(
      z.object({
        role: policyRoleSchema,
        permissions: z.array(permissionSchema).default([])
      })
    )
    .default([]),
  metadata: z.record(z.unknown()).optional()
});

export type PolicyInput = z.infer<typeof policySchema>;

export const storageBackendSchema = z.object({
  id: z.string().min(1),
  driver: z.string().min(1),
  config: z.record(z.unknown()).default({})
});

export type StorageBackendInput = z.infer<typeof storageBackendSchema>;

export const agentDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  skills: z.array(z.string()).default([]),
  entrypoint: z.string().min(1)
});

export type AgentDefinitionInput = z.infer<typeof agentDefinitionSchema>;

export const skillDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  runtime: z.enum(['python', 'node', 'shell']).default('node'),
  location: z.string().min(1)
});

export type SkillDefinitionInput = z.infer<typeof skillDefinitionSchema>;

export const engineEnvSchema = z.object({
  [ENGINE_ENV.mode]: engineModeSchema.optional(),
  [ENGINE_ENV.mag]: engineIdSchema.optional(),
  [ENGINE_ENV.sag]: engineIdSchema.optional()
});

const flowSummaryStepMcpSchema = z
  .object({
    calls: z.number().nonnegative().default(0),
    errors: z.number().nonnegative().default(0)
  })
  .partial()
  .transform((value) => ({
    calls: value.calls ?? 0,
    errors: value.errors ?? 0
  }));

const flowSummaryStepSchemaInternal = z
  .object({
    name: nonEmptyString('Step name is required.'),
    runs: z.number().nonnegative().default(0),
    successes: z.number().nonnegative().default(0),
    errors: z.number().nonnegative().default(0),
    success_rate: z.number().nonnegative().default(0),
    avg_latency_ms: z.number().nonnegative().default(0),
    mcp: flowSummaryStepMcpSchema.optional(),
    models: z.array(z.string()).optional(),
    error_types: z.record(z.number().nonnegative()).optional()
  })
  .passthrough();

const flowSummaryModelSchemaInternal = z
  .object({
    name: nonEmptyString('Model name is required.'),
    calls: z.number().nonnegative().default(0),
    errors: z.number().nonnegative().default(0),
    tokens: z
      .object({
        input: z.number().nonnegative().default(0),
        output: z.number().nonnegative().default(0),
        total: z.number().nonnegative().default(0)
      })
      .default({ input: 0, output: 0, total: 0 }),
    cost_usd: z.number().nonnegative().default(0)
  })
  .passthrough();

export const flowSummaryStepSchema = flowSummaryStepSchemaInternal;
export const flowSummaryModelSchema = flowSummaryModelSchemaInternal;

export const flowSummarySchema = z
  .object({
    runs: z.number().nonnegative().default(0),
    successes: z.number().nonnegative().default(0),
    success_rate: z.number().nonnegative().default(0),
    avg_latency_ms: z.number().nonnegative().default(0),
    errors: z
      .object({
        total: z.number().nonnegative().default(0),
        by_type: z.record(z.number().nonnegative()).default({})
      })
      .default({ total: 0, by_type: {} }),
    mcp: z
      .object({
        calls: z.number().nonnegative().default(0),
        errors: z.number().nonnegative().default(0),
        tokens: z
          .object({
            input: z.number().nonnegative().default(0),
            output: z.number().nonnegative().default(0),
            total: z.number().nonnegative().default(0)
          })
          .default({ input: 0, output: 0, total: 0 }),
        cost_usd: z.number().nonnegative().default(0)
      })
      .default({
        calls: 0,
        errors: 0,
        tokens: { input: 0, output: 0, total: 0 },
        cost_usd: 0
      }),
    steps: z.array(flowSummaryStepSchemaInternal).default([]),
    models: z.array(flowSummaryModelSchemaInternal).default([])
  })
  .passthrough();

export type FlowSummary = z.infer<typeof flowSummarySchema>;
export type FlowSummaryStep = z.infer<typeof flowSummaryStepSchema>;
export type FlowSummaryModel = z.infer<typeof flowSummaryModelSchema>;

export const runnerEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('log'), data: z.string() }),
  z.object({
    type: z.literal('message'),
    role: z.enum(['assistant', 'tool', 'system']),
    content: z.string()
  }),
  z.object({
    type: z.literal('diff'),
    files: z
      .array(
        z.object({
          path: z.string(),
          patch: z.string()
        })
      )
      .default([])
  }),
  z.object({
    type: z.literal('tool-call'),
    call: z.object({
      name: z.string().min(1),
      arguments: z.record(z.unknown()).default({})
    })
  }),
  z.object({
    type: z.literal('flow-summary'),
    summary: flowSummarySchema
  }),
  z.object({
    type: z.literal('done'),
    sessionId: z.string().optional(),
    stats: z.record(z.unknown()).optional()
  }),
  z.object({
    type: z.literal('error'),
    error: z.object({
      message: z.string(),
      code: z.string().optional(),
      details: z.record(z.unknown()).optional()
    })
  })
]);

export type RunnerEventPayload = z.infer<typeof runnerEventSchema>;

export const worktreeLockStateSchema = z
  .object({
    locked: z.boolean(),
    reason: z.string().optional(),
    timestamp: isoTimestampSchema.optional()
  })
  .passthrough();

export const worktreeMetadataSchema = z
  .object({
    id: nonEmptyString('Worktree id is required.'),
    runId: z.string().min(1).optional(),
    task: z.string().optional(),
    base: nonEmptyString('Base ref is required.'),
    branch: z.string().optional(),
    detach: z.boolean().optional(),
    noCheckout: z.boolean().optional(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    locked: z.boolean().optional(),
    lockReason: z.string().optional(),
    lockTimestamp: isoTimestampSchema.optional(),
    version: z.number().int().min(1).default(1)
  })
  .passthrough();

export const worktreeStateSchema = z
  .object({
    id: nonEmptyString('Worktree id is required.'),
    runId: nonEmptyString('Run id is required.'),
    task: z.string().optional(),
    name: nonEmptyString('Worktree directory name is required.'),
    path: nonEmptyString('Worktree path is required.'),
    branch: z.string().optional(),
    base: z.string().optional(),
    head: z.string().optional(),
    detached: z.boolean(),
    noCheckout: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
    prunable: z.boolean(),
    lock: worktreeLockStateSchema,
    metadataPath: z.string().optional(),
    metadata: worktreeMetadataSchema.optional()
  })
  .passthrough();

export const worktreeEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('worktree.create'),
    worktree: worktreeStateSchema
  }),
  z.object({
    type: z.literal('worktree.remove'),
    worktree: worktreeStateSchema
  }),
  z.object({
    type: z.literal('worktree.lock'),
    worktree: worktreeStateSchema
  }),
  z.object({
    type: z.literal('worktree.unlock'),
    worktree: worktreeStateSchema
  }),
  z.object({
    type: z.literal('worktree.prune'),
    expire: z.string().optional()
  }),
  z.object({
    type: z.literal('worktree.repair')
  })
]);

export type WorktreeMetadata = z.infer<typeof worktreeMetadataSchema>;
export type WorktreeState = z.infer<typeof worktreeStateSchema>;
export type WorktreeEventPayload = z.infer<typeof worktreeEventSchema>;

export const schemaBundle = {
  engineIdSchema,
  engineModeSchema,
  runSpecSchema,
  engineSelectionSchema,
  engineEnvSchema,
  runnerEventSchema,
  flowSummarySchema,
  flowSummaryStepSchema,
  flowSummaryModelSchema,
  worktreeMetadataSchema,
  worktreeStateSchema,
  worktreeEventSchema,
  policySchema,
  storageBackendSchema,
  agentDefinitionSchema,
  skillDefinitionSchema
};

export { ENGINE_ENV } from '@magsag/core';
