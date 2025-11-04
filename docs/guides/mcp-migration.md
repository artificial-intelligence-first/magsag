---
title: MCP Migration Guide
slug: guide-mcp-migration
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- mcp
- migration
summary: Checklist for migrating MCP skills and agents to the TypeScript catalog.
description: Explains how to map legacy MCP Python assets to the new TypeScript implementations and registry format.
authors: []
sources:
- id: R1
  title: @magsag/catalog Package
  url: ../../packages/catalog/src/index.ts
  accessed: '2025-11-06'
- id: R2
  title: TypeScript Full Migration Plan
  url: ../development/plans/typescript-full-migration.md
  accessed: '2025-11-06'
---

# MCP Migration Guide

> **For Humans**: Use this guide when porting MCP skills or agents from the legacy Python stack.
>
> **For AI Assistants**: Apply these steps exactly. Note all skipped validations.

## Migration Steps

1. **Identify legacy entrypoints** — Replace `catalog/.../*.py:run` references with `@magsag/catalog#skills.<Name>` or `@magsag/catalog#agents.<Name>` and update registry YAML accordingly.
2. **Port business logic** — Implement the skill/agent inside a TypeScript package (usually `packages/catalog`). Share common types via `packages/catalog/src/shared/types.ts`.
3. **Update contracts** — Ensure JSON Schemas under `catalog/contracts/` remain accurate. Add new schemas when skill payloads change.
4. **Wire MCP access** — Inject `McpRuntime` instances into TypeScript skills through the exported interfaces. Use `pnpm catalog:validate` to confirm schema integrity.
5. **Document the change** — Refresh AGENTS, SSOT, and relevant guides. Append update logs noting "Python asset removed" and the new TypeScript module path.

## Validation Commands

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

Run additional e2e suites (`pnpm vitest --run --project e2e`) when MCP flows are affected.

## Registry Examples

```yaml
entrypoint: "@magsag/catalog#skills.salaryBandLookup"
permissions:
  - "mcp:pg-readonly"
```

```yaml
entrypoint: "@magsag/catalog#agents.offerOrchestratorMag"
depends_on:
  sub_agents:
    - magsag://sub.compensation-advisor-sag@>=0.1.0
```

## Legacy Python Assets

Legacy MCP modules (`catalog/.../impl/*.py`) were removed in Workstream F. Refer to earlier commits if historical context is required.
