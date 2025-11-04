---
title: Skill Development Cheatsheet
slug: architecture-skills
> **Notice**: Legacy Python-based skill guidance; update pending TypeScript catalog tooling.
status: deprecated
last_updated: 2025-11-02
tags:
- skills
- workflow
summary: Checklist for defining, implementing, and shipping skills within the MAGSAG
  catalog.
authors: []
sources:
- id: R1
  title: Catalog Skill Templates
  url: ../../catalog/skills/_template/SKILL.md
  accessed: '2025-11-01'
last_synced: '2025-11-02'
description: Checklist for defining, implementing, and shipping skills within the
  MAGSAG catalog.
---

# Skill Development Cheatsheet

> **For Humans**: Use this guide to deliver skills that match catalog and runtime expectations with minimal rework.
>
> **For AI Agents**: Enforce these steps when editing skill code or metadata; escalate if requirements conflict.

## Overview

This cheatsheet keeps skill development consistent without forcing you to read pages of prose. Link out to detailed guides when further context is needed.

## Where Things Live

- Registry: `catalog/registry/skills.yaml`
- Implementation: `catalog/skills/<slug>/code/`
- Optional docs/resources: `catalog/skills/<slug>/SKILL.md`, `templates/`, `schemas/`

## Definition Checklist

1. Choose a canonical `id` (`skill.<slug>`) and append semantic versions.
2. Point `entrypoint` to the callable (`catalog/skills/.../code/main.py:run`).
3. Declare permissions; use the narrowest scope (e.g., `[]`, `["mcp:filesystem.read"]`).
4. Provide a short description or tags if discoverability matters.

## Implementation Notes

- Define tools in `packages/catalog-mcp/src/tools/<skill>.ts` and export a factory that returns a `ToolDefinition`.
  ```ts
  import { z } from 'zod';
  import type { ToolDefinition } from '@magsag/mcp-server';

  export const createExampleTool = (): ToolDefinition => ({
    name: 'skill.example',
    inputSchema: {
      query: z.string().min(1)
    },
    handler: async (args) => ({
      isError: false,
      content: [{ type: 'text', text: JSON.stringify({ query: args.query }) }]
    })
  });
  ```
- Point `entrypoint` in `skill.yaml` to the TypeScript factory (`packages/catalog-mcp/src/tools/<skill>.ts:createExampleTool`).
- Prefer Zod for validation and keep handlers deterministic; read configuration from payload or documented `MAGSAG_` environment variables.
- Raise structured errors when prerequisites (e.g., remote MCP servers) are missing.

## Testing

```bash
pnpm --filter @magsag/catalog-mcp test
pnpm --filter @magsag/catalog-mcp lint
pnpm --filter @magsag/catalog-mcp typecheck
```

Cover:
- Success and failure paths.
- MCP-enabled and MCP-disabled scenarios (ensure helpful error messaging when dependencies are missing).
- Contract compliance (return type matches calling agent expectations).

## Documentation & Release

- Update per-skill `SKILL.md` with purpose, inputs, outputs, and fallbacks.
- Cross-link new terminology in `docs/architecture/ssot.md` when needed.
- Add changelog entries for behaviour changes.
- Bump the registry version when modifying inputs, outputs, or side effects.

## References

- `docs/guides/mcp-integration.md` – full MCP server/client walkthrough.
- `catalog/skills/salary-band-lookup/` – async skill with MCP integration.
- `tests/mcp/` – integration tests demonstrating mocked transports.

## Update Log

- 2025-11-02: Refreshed metadata and aligned tags with the documentation taxonomy.
- 2025-11-01: Converted to the unified documentation format and refreshed references.

Keep this cheatsheet lean. If you find yourself adding long explanations, move them into the relevant guide and link back instead.
