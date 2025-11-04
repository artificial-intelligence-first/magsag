---
title: TypeScript Migration Workstreams Tracker
slug: typescript-migration-workstreams
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
tags:
  - magsag
  - plans
  - migration
  - coordination
summary: Operational board for running the TypeScript migration workstreams in parallel.
description: Tracks owners, branches, validation gates, and ready commands for each TypeScript migration workstream so multiple AI assistants can execute concurrently without collisions.
authors: []
sources:
  - docs/development/plans/typescript-full-migration.md
  - AGENTS.md
  - SSOT.md
---

# TypeScript Migration Workstreams — Coordination Board

Use this board to slice the TypeScript monorepo migration into independent workstreams and monitor ownership, branch status, and validation gates. Update the appropriate row whenever ownership changes, and mirror any contract updates into the ExecPlan (`docs/development/plans/typescript-full-migration.md`) under Progress or Surprises & Discoveries.

## Branching Quickstart
- Create worktrees manually (the legacy Typer helper was removed): `git worktree add ../wt-<id>-typescript-full-migration main`. Record the command in hand-off notes.
- Branch naming: `feature/ts-migration/<workstream>/<short-desc>`
- PR title example: `[TS Migration][Workstream A] Implement MCP server`
- Merge shared schema or contract changes into `integration/ts-migration/shared` first, then cherry-pick into dependent workstreams.

## Workstream Assignment Table

| Workstream | Scope snapshot | Owner | Branch | Worktree path | Status | Next gate |
| ---------- | -------------- | ----- | ------ | ------------- | ------ | --------- |
| A — MCP | `@magsag/mcp-client` (done), `@magsag/mcp-server`, CLI/runner registry, Python MCP removal | Codex | `wt/ts-migration-a/typescript-full-migration` | `.worktrees/wt-ts-migration-a-typescript-full-migration-6abadd3` | In progress | Draft MCP server API skeleton |
| B — Core | `packages/core/worktree/governance/observability/storage`, Zod schemas, OTel + Pino | Codex (setup) | `wt/ts-migration-b/typescript-full-migration` | `.worktrees/wt-ts-migration-b-typescript-full-migration-6abadd3` | Ready | Type skeleton & shared schema stubs |
| C — Server | `@magsag/server` SSE/WS, MAG/SAG switching, OpenAPI generation, metrics | Codex (setup) | `wt/ts-migration-c/typescript-full-migration` | `.worktrees/wt-ts-migration-c-typescript-full-migration-6abadd3` | Ready | Choose HTTP framework + OpenAPI pipeline |
| D — Tests/CI | Vitest unit/integration/e2e, GitHub Actions lint/typecheck/test/build/e2e/size | Codex (setup) | `wt/ts-migration-d/typescript-full-migration` | `.worktrees/wt-ts-migration-d-typescript-full-migration-6abadd3` | Ready | Define test matrix + workflow outline |
| E — Docs/Governance | README/AGENTS/SSOT/CHANGELOG/PLANS, catalog templates, frontmatter cleanup | Codex (setup) | `wt/ts-migration-e/typescript-full-migration` | `.worktrees/wt-ts-migration-e-typescript-full-migration-6abadd3` | Ready | Outline doc diffs + taxonomy updates |
| F — Legacy Cleanup & Release | Python/FastAPI/uv removal, `pnpm -r build/lint/test`, 2.0.0 tag prep | Codex (setup) | `wt/ts-migration-f/typescript-full-migration` | `.worktrees/wt-ts-migration-f-typescript-full-migration-6abadd3` | In progress | Remove legacy assets + confirm parity |

## Ready-to-Run Command Snippets

```bash
# Example: set up Workstream A
git worktree add ../wt-ts-migration-a-typescript-full-migration main
cd ../wt-ts-migration-a-typescript-full-migration
git checkout -b feature/ts-migration/a-mcp-server-skeleton

# Per-workstream validation (replace <pkg> as needed)
pnpm --filter @magsag/mcp-server lint
pnpm --filter @magsag/mcp-server typecheck
pnpm --filter @magsag/mcp-server test
```

## Status Legend

- **Not started** — worktree/branch not provisioned
- **Ready** — environment prepared, awaiting assignment
- **In progress** — changes underway
- **Reviewing** — PR raised, waiting on feedback
- **Blocked** — external dependency or unresolved contract
- **Done** — merged to `main`

## Update Checklist

When handing off between assistants:
1. Update the assignment table (Owner / Branch / Status / Next gate).
2. Append a Progress entry in `docs/development/plans/typescript-full-migration.md`.
3. Document blockers or tooling gaps in `Surprises & Discoveries`.
4. Share any required worktree commands or session metadata in the delivery notes.
