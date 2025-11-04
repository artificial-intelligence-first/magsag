---
title: Agent-to-Agent Communication
slug: guide-a2a-communication
status: deprecated
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- agents
- coordination
summary: Placeholder guidance while A2A flows migrate to TypeScript agents and skills.
description: Notes the retirement of Python examples and points to the TypeScript catalog for current patterns.
authors: []
sources:
- id: R1
  title: @magsag/catalog Agents
  url: ../../packages/catalog/src/agents/index.ts
  accessed: '2025-11-06'
---

# Agent-to-Agent Communication

> **Status**: The Python orchestration examples under `catalog/agents/_template` have been removed. TypeScript equivalents live in `packages/catalog` and will be documented in detail in an upcoming revision.

## Next Steps

- Use `@magsag/catalog` exports for MAG/SAG coordination.
- Update catalog YAML to reference `@magsag/catalog#agents.*` entrypoints.
- Follow Workstream B notes in `docs/development/plans/typescript-full-migration-workstreams.md` for cross-agent messaging updates.

## Validation Checklist

- `pnpm -r lint`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm docs:lint`
- `pnpm catalog:validate`

## Legacy Reference

Archived Python examples (e.g., `code/orchestrator.py`) were removed in branch `feature/ts-migration/f-legacy-cleanup`. Consult the Git history if needed.
