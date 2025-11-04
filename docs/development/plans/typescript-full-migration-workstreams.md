---
title: TypeScript Migration Workstreams Tracker
slug: typescript-migration-workstreams
status: living
last_updated: 2025-11-03
last_synced: '2025-11-03'
tags:
  - magsag
  - plans
  - migration
  - coordination
summary: Operational board for running the TypeScript migration workstreams in parallel.
description: Tracks owners, branches, validation gates, and ready commands for each TypeScript migration workstream so multiple AI agents can execute concurrently without collisions.
authors: []
sources:
  - docs/development/plans/typescript-full-migration.md
  - AGENTS.md
  - SSOT.md
---

# TypeScript Migration Workstreams — Coordination Board

Use this board to divide the TypeScript monorepo migration into self-contained workstreams and track ownership, branches, and validation status. Update each row when a workstream is claimed or released, and mirror contract updates in the Progress or Surprises & Discoveries sections of `docs/development/plans/typescript-full-migration.md`.

## Branching Quickstart
- Worktree: `uv run magsag wt new <run> --task typescript-full-migration --base main`
- Branch naming: `feature/ts-migration/<workstream>/<short-desc>`
- Pull request title example: `[TS Migration][Workstream A] Implement MCP server`
- Merge shared schema or contract updates into `integration/ts-migration/shared` first, then fan them out to individual branches.

## Workstream Assignment Table

| Workstream | Scope snapshot | Owner | Branch | Worktree path | Status | Next gate |
| ---------- | -------------- | ----- | ------ | ------------- | ------ | --------- |
| A — MCP | `@magsag/mcp-client` (done), `@magsag/mcp-server`, CLI/Runner registry, remove Python MCP | Codex | `wt/ts-migration-a/typescript-full-migration` | `.worktrees/wt-ts-migration-a-typescript-full-migration-6abadd3` | In progress | Draft MCP server API skeleton |
| B — Core | `packages/core/worktree/governance/observability/storage`, Zod schemas, OTel + Pino | Codex | `wt/ts-migration-b/typescript-full-migration` | `.worktrees/wt-ts-migration-b-typescript-full-migration-6abadd3` | In progress | Promote shared types into `@magsag/schema` |
| C — Server | `@magsag/server` SSE/WebSocket handling, MAG/SAG switching, OpenAPI generation, metrics | Codex (setup) | `wt/ts-migration-c/typescript-full-migration` | `.worktrees/wt-ts-migration-c-typescript-full-migration-6abadd3` | Ready | Choose HTTP framework + OpenAPI pipeline |
| D — Tests/CI | Vitest unit/integration/e2e, GitHub Actions lint/typecheck/test/build/e2e/size, size guard | Codex | `wt/ts-migration-d/typescript-full-migration` | `.worktrees/wt-ts-migration-d-typescript-full-migration-6abadd3` | In progress | Harden matrix for CLI flows & GitHub Actions smoke runs |
| E — Docs/Governance | README, AGENTS, SSOT, CHANGELOG, PLANS, catalog templates, frontmatter updates | Codex (setup) | `wt/ts-migration-e/typescript-full-migration` | `.worktrees/wt-ts-migration-e-typescript-full-migration-6abadd3` | Ready | Outline doc diffs + taxonomy updates |
| F — Legacy Cleanup & Release | Remove Python/FastAPI/uv, ensure `pnpm -r build/lint/test` passes, tag 2.0.0 | Codex (setup) | `wt/ts-migration-f/typescript-full-migration` | `.worktrees/wt-ts-migration-f-typescript-full-migration-6abadd3` | Ready | Inventory legacy paths + confirm parity |

## Ready-to-Run Command Snippets

Copy and fill the placeholders for each workstream:

```bash
# create dedicated worktree (example for Workstream A)
uv run magsag wt new ts-migration-a --task typescript-full-migration --base main
cd _worktrees/ts-migration-a
git checkout -b feature/ts-migration/mcp-server-skeleton

# per-workstream lint/typecheck/test baseline
pnpm --filter @magsag/mcp-server lint
pnpm --filter @magsag/mcp-server typecheck
pnpm --filter @magsag/mcp-server test
```

## Status Legend

- **Not started** — no branch/worktree yet
- **Ready** — branch/worktree provisioned, waiting for an assignee
- **In progress** — branch open, changes underway
- **Reviewing** — PR raised, waiting for review
- **Blocked** — external dependency or contract pending
- **Done** — merged to main

## Update Checklist

When handing off work between agents:
1. Update the table (Owner / Branch / Status / Next gate).
2. Append a Progress entry in `docs/development/plans/typescript-full-migration.md`.
3. Record blockers in `Surprises & Discoveries`.
4. Leave branch and worktree instructions in the session metadata (`.magsag/sessions/*`) if required.
