import { z } from 'zod';
import { ENGINE_IDS, ENGINE_ENV, type EngineId } from '@magsag/core';

const ENGINE_ID_LITERALS = [...ENGINE_IDS] as [EngineId, ...EngineId[]];
const ENGINE_MODE_LITERALS = ['auto', 'subscription', 'api', 'oss'] as const;

export const engineIdSchema = z.enum(ENGINE_ID_LITERALS);

export const engineModeSchema = z.enum(ENGINE_MODE_LITERALS);

export const runSpecSchema = z.object({
  engine: engineIdSchema,
  repo: z.string().min(1, 'Repository path is required.'),
  prompt: z.string().min(1, 'Prompt is required.'),
  resumeId: z.string().min(1).optional(),
  extra: z.record(z.unknown()).optional()
});

export type RunSpecInput = z.infer<typeof runSpecSchema>;

export const engineSelectionSchema = z.object({
  mode: engineModeSchema,
  mag: engineIdSchema,
  sag: engineIdSchema
});

export type EngineSelectionInput = z.infer<typeof engineSelectionSchema>;

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

export const schemaBundle = {
  engineIdSchema,
  engineModeSchema,
  runSpecSchema,
  engineSelectionSchema,
  engineEnvSchema,
  runnerEventSchema,
  policySchema,
  storageBackendSchema,
  agentDefinitionSchema,
  skillDefinitionSchema
};

export { ENGINE_ENV } from '@magsag/core';
