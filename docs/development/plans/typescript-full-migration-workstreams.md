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

Useこのボード to slice the TypeScriptモノレポ移行 into独立したワークストリーム and monitor ownership / branch /検証状況. Update each row when取得済み/解放, and mirror any契約変更 into `docs/development/plans/typescript-full-migration.md`のProgress or Surprises&Discoveries.

## Branching Quickstart
- Worktree: `uv run magsag wt new <run> --task typescript-full-migration --base main`
- Branch 命名: `feature/ts-migration/<workstream>/<short-desc>`
- Pull request タイトル例: `[TS Migration][Workstream A] Implement MCP server`
- 共有スキーマ/契約変更は先に `integration/ts-migration/shared` へマージしてから他のブランチへ取り込む。

## Workstream Assignment Table

| Workstream | Scope snapshot | Owner | Branch | Worktree path | Status | Next gate |
| ---------- | -------------- | ----- | ------ | ------------- | ------ | --------- |
| A — MCP | `@magsag/mcp-client` (done), `@magsag/mcp-server`, CLI/Runner registry, Python MCP removal | Codex | `wt/ts-migration-a/typescript-full-migration` | `.worktrees/wt-ts-migration-a-typescript-full-migration-6abadd3` | In progress | Draft MCP server API skeleton |
| B — Core | `packages/core/worktree/governance/observability/storage`, Zod schemas, OTel+Pino | Codex (setup) | `wt/ts-migration-b/typescript-full-migration` | `.worktrees/wt-ts-migration-b-typescript-full-migration-6abadd3` | Ready | Type skeleton & shared schema stubs |
| C — Server | `@magsag/server` SSE/WS, MAG/SAG切替, OpenAPI生成, metrics | Codex (setup) | `wt/ts-migration-c/typescript-full-migration` | `.worktrees/wt-ts-migration-c-typescript-full-migration-6abadd3` | Ready | Choose HTTP framework + OpenAPI pipeline |
| D — Tests/CI | Vitest unit/integration/e2e, GH Actions lint/typecheck/test/build/e2e/size, size check | Codex (setup) | `wt/ts-migration-d/typescript-full-migration` | `.worktrees/wt-ts-migration-d-typescript-full-migration-6abadd3` | Ready | Define test matrix + workflow outline |
| E — Docs/Governance | README/AGENTS/SSOT/CHANGELOG/PLANS、catalog templates、frontmatter整備 | Codex (setup) | `wt/ts-migration-e/typescript-full-migration` | `.worktrees/wt-ts-migration-e-typescript-full-migration-6abadd3` | Ready | Outline doc diffs + taxonomy updates |
| F — Legacy Cleanup & Release | Python/FastAPI/uv 削除、`pnpm -r build/lint/test` 緑化、2.0.0 タグ | Codex (setup) | `wt/ts-migration-f/typescript-full-migration` | `.worktrees/wt-ts-migration-f-typescript-full-migration-6abadd3` | Ready | Inventory legacy paths + confirm parity |

## Ready-to-Run Command Snippets

Copy → Fill placeholders for各ワークストリーム:

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
- **Ready** — branch/worktree provisioned, awaiting active engineer
- **In progress** — branch open, changes ongoing
- **Reviewing** — PR raised, awaiting review
- **Blocked** — external dependency or contract pending
- **Done** — merged to main

## Update Checklist

When handing off between agents:
1. Update the table (Owner / Branch / Status / Next gate).
2. Append a Progress entry in `docs/development/plans/typescript-full-migration.md`.
3. Note blocking issues in `Surprises & Discoveries`。
4. Leave branch + worktree instructions in session metadata (`.magsag/sessions/*`) if needed.
