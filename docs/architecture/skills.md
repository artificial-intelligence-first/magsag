---
title: Skill Development Cheatsheet
slug: architecture-skills
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- skills
- workflow
summary: Checklist for implementing catalog skills in the TypeScript monorepo.
description: Outlines the steps for creating, validating, and documenting TypeScript-based skills.
authors: []
sources:
- id: R1
  title: @magsag/catalog Skills
  url: ../../packages/catalog/src/skills/index.ts
  accessed: '2025-11-06'
---

# Skill Development Cheatsheet

## Locations

- Registry definitions: `catalog/registry/skills.yaml`
- Implementation modules: `packages/catalog/src/skills/*.ts`
- Shared types: `packages/catalog/src/shared/types.ts`
- Optional docs/resources: `catalog/skills/<slug>/SKILL.md`

## Definition Checklist

1. Use canonical IDs (`skill.<slug>`) and semantic versions.
2. Point `entrypoint` to a TypeScript export (e.g., `@magsag/catalog#skills.salaryBandLookup`).
3. Declare permissions (`[]` by default; add `mcp:*` scopes when required).
4. Document input/output schemas under `catalog/contracts/` when payloads change.

## Implementation Notes

- Implement skills as async functions:
  ```ts
  export const run = async (
    payload: Record<string, unknown>,
    context: SkillContext = {}
  ): Promise<Record<string, unknown>> => {
    // ...
  };
  ```
- Validate payloads explicitly (Zod or manual guards).
- Surface MCP errors; include defensive fallbacks when possible.
- Keep functions pure; read configuration from payload or documented environment variables.

## Validation

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

Run targeted suites when needed:

```bash
pnpm vitest --run --project unit
pnpm vitest --run --project integration
pnpm vitest --run --project e2e    # for MCP flows
```

## Documentation

- Update `SKILL.md` with purpose, inputs, outputs, and fallbacks.
- Cross-link terminology in `docs/architecture/ssot.md`.
- Add changelog entries for user-facing changes.
- Bump registry versions when behaviour changes.

## References

- `@magsag/catalog/src/skills` — canonical implementations.
- `docs/guides/mcp-integration.md` — MCP setup checklist.
- `docs/development/validation-memo.md` — Documentation validation log.

## Update Log

- 2025-11-06: Migrated cheatsheet to TypeScript workflow (legacy Python guidance removed).
