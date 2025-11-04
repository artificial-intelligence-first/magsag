---
title: ExecPlan — TypeScript Full Migration (Big Bang)
slug: typescript-full-migration
status: living
last_updated: 2025-11-03
last_synced: '2025-11-03'
tags:
- magsag
- plans
- migration
summary: Big-bang migration of MAGSAG to a TypeScript monorepo with CLI-default runners (codex-cli & claude-cli) and optional API runners (OpenAI Agents, Claude Agent SDK, Google ADK), plus first-class MCP.
description: Replace the Python stack with a TypeScript monorepo (pnpm+turborepo). Re-implement runners, server, CLI, governance, observability, and worktree. Integrate ADK/Agents/Claude SDK. Remove legacy code entirely and cut 2.0.0.
authors: [MAGSAG-AI]
sources:
- https://github.com/artificial-intelligence-first/magsag
- https://github.com/openai/openai-agents-js
- https://github.com/anthropics/claude-agent-sdk-typescript
- https://github.com/google/adk-js
---

# ExecPlan: TypeScript Full Migration (Big Bang)

## Purpose / Big Picture
- Deliver **MAGSAG 2.0** as a **TypeScript-only** monorepo with **CLI-first execution** (no API keys required; ChatGPT/Claude subscription sign-in) and **optional API mode** (OpenAI Agents / Claude Agent SDK / Google ADK). MAG and SAG roles remain configurable (recommended default: MAG = `codex-cli`, SAG = `claude-cli`).

## To-do
- [ ] Create the monorepo skeleton (pnpm + Turborepo + Node 22)
- [ ] Port core, schema, CLI, server, governance, observability, and worktree packages to TypeScript
- [ ] Implement runners: **codex-cli (default)**, **claude-cli (default)**, `openai-agents` (opt-in), `claude-agent` (opt-in), `adk` (opt-in)
- [ ] Add MCP client and server packages
- [ ] Migrate tests to Vitest; add CLI / SSE / WebSocket / MCP end-to-end coverage
- [ ] Stand up GitHub Actions CI (lint / typecheck / test / build / e2e / size)
- [ ] Rewrite documentation (README, AGENTS, SSOT, CHANGELOG, PLANS)
- [ ] Remove Python / FastAPI / uv legacy code and tag **v2.0.0**

## Parallel Execution Readiness

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

1. Create isolated worktrees with `uv run magsag wt new <run> --task typescript-full-migration --base main`. Avoid manual `git worktree` usage so helper scripts keep pace with the transition away from the Python CLI.
2. Name branches `feature/ts-migration/<workstream>/<short-desc>`; use `ci/ts-migration/<desc>` for cross-cutting CI tweaks. Route shared dependency updates through `integration/ts-migration/shared` first.
3. When updating shared schemas or utilities, notify affected workstreams before merging to avoid collisions during active sessions.
4. Start validation with `pnpm --filter <pkg> lint typecheck test`. Escalate to `pnpm -r typecheck` followed by `pnpm -r test` only when the blast radius extends across packages.

### Workstream Breakdown
#### Workstream A — MCP First-class Support
- **Scope**: `@magsag/mcp-client` (already ported) and `@magsag/mcp-server`, CLI/runner registry integration, removal of the Python MCP runtime.
- **Dependencies**: Existing runner/CLI IPC contracts; Workstream C SSE/WebSocket specifications.
- **Deliverables**: TypeScript MCP server/client implementations with stdio/SSE/HTTP/WebSocket support plus verification fixtures.
- **Definition of Done**:
  - `pnpm --filter @magsag/mcp-server lint typecheck test`
  - Manual confirmation that `magsag agent run` lists tools through MCP
  - Python MCP implementation removed; all Vitest suites green

#### Workstream B — Core Subsystems Rewrite
- **Scope**: TypeScript conversion and integration of `packages/core`, `packages/worktree`, `packages/governance`, `packages/observability`, and storage components.
- **Dependencies**: MCP types from Workstream A; server event definitions from Workstream C.
- **Deliverables**: Zod-based policy models, OpenTelemetry + Pino observability, storage abstraction.
- **Definition of Done**:
  - Run `pnpm --filter <pkg> lint typecheck test` for each package
  - Consolidate shared types in `@magsag/schema` without downstream compile errors
  - Integration tests confirm observability events are available to server and CLI

#### Workstream C — Server Finish-out
- **Scope**: `@magsag/server` SSE/WebSocket implementation, Zod to OpenAPI generation, MAG/SAG switching, sessions and metrics pipeline.
- **Dependencies**: Contracts from Workstreams A and B.
- **Deliverables**: Fully functioning `/api/v1/agent/run`, OpenAPI artifact, SSE/WebSocket handlers, metrics output.
- **Definition of Done**:
  - `pnpm --filter @magsag/server lint typecheck test`
  - `pnpm --filter @magsag/server build` regenerates the OpenAPI artifact
  - At least one SSE/WebSocket end-to-end test (Vitest or Playwright)

#### Workstream D — Tests & CI
- **Scope**: Vitest unit/integration/CLI/e2e coverage plus GitHub Actions workflows for lint/typecheck/test/build/e2e/size.
- **Dependencies**: Stabilized deliverables from Workstreams A–C; CLI/doc commands shaped by Workstream E.
- **Deliverables**: `pnpm -r test` green, `.github/workflows/ts-ci.yml` (or equivalent) stood up, bundle-size guard in place.
- **Definition of Done**:
  - `pnpm vitest --run`
  - GitHub Actions workflow covering lint/typecheck/test/build/e2e/size
  - Bundle-size check configured and green

#### Workstream E — Docs & Governance Refresh
- **Scope**: Update README, AGENTS, SSOT, CHANGELOG, PLANS; align catalog templates and frontmatter.
- **Dependencies**: Outputs from Workstreams A–D for accurate documentation.
- **Deliverables**: Documentation aligned with the TypeScript stack, tags and taxonomy refreshed.
- **Definition of Done**:
  - Docs updated and cross-linked per `docs/governance/frontmatter.md`
  - CHANGELOG entry under `## [Unreleased]`
  - Governance references synchronized with catalog templates

#### Workstream F — Legacy Cleanup & Release
- **Scope**: Remove Python/FastAPI/uv artifacts; ensure `pnpm -r build/lint/test` passes; prepare the 2.0.0 release tag.
- **Dependencies**: Completion of Workstreams A–E.
- **Deliverables**: Clean TypeScript-only tree, release notes, v2.0.0 tag.
- **Definition of Done**:
  - Legacy code removed
  - Release documentation prepared and approved
  - v2.0.0 tag pushed

## Progress
- 2025-11-03T00:00:00Z — Plan created
- 2025-11-03T17:30:00Z — Ported MCP client resilience layer to TypeScript (`@magsag/mcp-client`); circuit breaker, retries, and SDK transport integration with Vitest coverage.
- 2025-11-03T17:40:00Z — Pending next: migrate `@magsag/mcp-server` with SDK wiring and end-to-end CLI integration (not started).
- 2025-11-03T18:00:00Z — Established parallel execution board (`docs/development/plans/typescript-full-migration-workstreams.md`) with branch/worktree conventions and definition-of-done checklists.
- 2025-11-03T18:05:00Z — Workstream A assigned (branch `wt/ts-migration-a/typescript-full-migration`, worktree `.worktrees/wt-ts-migration-a-typescript-full-migration-6abadd3`) to implement the TypeScript MCP server skeleton.
- 2025-11-03T18:08:00Z — Provisioned Workstreams B–F with dedicated worktrees (`.worktrees/wt-ts-migration-{b..f}-typescript-full-migration-6abadd3`) and placeholder branches.
- 2025-11-04T03:20:00Z — Workstream D bootstrap: shared logging workspace package, Vitest unit/integration/CLI/e2e suites, pnpm CI scripts, and `ts-ci` workflow wired to lint/typecheck/build/test/size the new surface.
- 2025-11-04T04:57:00Z — Workstream D aligned repo-wide lint/typecheck/build workflows by switching packages to source-first type exports and adding missing runtime dependencies.

## Decision Log
- 2025-11-03T00:00:00Z — Big-bang migration (no phased rollout)
- 2025-11-03T00:00:00Z — CLI as the default execution mode (API is optional)
- 2025-11-03T00:00:00Z — MAG/SAG roles remain assignable per engine

## Surprises & Discoveries
- Source-first type exports were required so packages can share declarations without prebuilding; manifests now point at `/src` and lint/typecheck run end-to-end.

## Outcomes & Retrospective
- (Populate once complete)

## Context and Orientation
- Current landscape: CLI, FastAPI server, governance, observability, catalog, worktree tooling.
- Target architecture: TypeScript monorepo (packages/apps/docs/tests with pnpm + Turborepo on Node 22).
- External SDKs:
  - OpenAI Agents SDK: `@openai/agents`
  - Claude Agent SDK: `@anthropic-ai/claude-agent-sdk`
  - Google ADK: `@google/adk`
  - MCP TypeScript SDK: `@modelcontextprotocol/sdk`

### Execution Modes (ENV Matrix)
- `ENGINE_MODE` = `subscription` | `api` | `oss`
  - `subscription` (default) → CLI runners only (no API keys required)
  - `api` → API runners (OpenAI/Anthropic/ADK) engage when keys are configured
- `ENGINE_MAG`, `ENGINE_SAG` = `codex-cli` | `claude-cli` | `openai-agents` | `claude-agent` | `adk`
  - Recommended default: `ENGINE_MAG=codex-cli`, `ENGINE_SAG=claude-cli`
- Examples:
  - Default: `ENGINE_MODE=subscription ENGINE_MAG=codex-cli ENGINE_SAG=claude-cli`
  - API: `ENGINE_MODE=api ENGINE_MAG=openai-agents ENGINE_SAG=claude-agent`

### API Contract (`/api/v1/agent/run`)
- Input: `RunSpec` (engine, repo, prompt, optional `resumeId`, optional `extra` payload)
- Output: **SSE/WebSocket stream** of `RunnerEvent`
  - `{"type":"log","data":string}`
  - `{"type":"message","role":"assistant"|"tool"|"system","content":string}`
  - `{"type":"diff","files":[{"path":string,"patch":string}]}`
  - `{"type":"done","sessionId"?:string,"stats"?:{}}`

## Plan of Work
1. Bootstrap the monorepo and configuration (pnpm, Turborepo, tsconfig, ESLint)
2. Implement core/schema (Zod + OpenAPI, runner interfaces, events)
3. Implement runners (CLI defaults plus optional API runners)
4. Implement server (Hono/Fastify evaluation), CLI (oclif)
5. Implement MCP (client and server)
6. Build tests (unit/integration/e2e) and CI
7. Update documentation, clean up legacy assets, cut 2.0.0

## Concrete Steps
1. [ ] **Scaffold**: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, ESLint/Prettier config
2. [ ] **Packages**: create initial structure for `@magsag/core`, `@magsag/schema`, `@magsag/cli`, `@magsag/server`, `@magsag/worktree`, `@magsag/governance`, `@magsag/observability`, `@magsag/runner-codex-cli`, `@magsag/runner-claude-cli`, `@magsag/runner-openai-agents`, `@magsag/runner-claude-agent`, `@magsag/runner-adk`, `@magsag/mcp-client`, `@magsag/mcp-server`
3. [ ] **Core/Schema**: define runner interfaces, event models, Zod schemas, OpenAPI output
4. [ ] **Runners (default)**:
    - `codex-cli`: parse `codex exec --json` (NDJSON) and `codex resume`
    - `claude-cli`: parse `claude -p --output-format stream-json` plus `--resume` / `--continue`
5. [ ] **Runners (optional)**: wrap `openai-agents`, `claude-agent`, `adk` SDKs
6. [ ] **Server**: implement `/api/v1/agent/run`, `/api/v1/sessions/*`, `/openapi.json`
7. [ ] **CLI**: port `flow/agent/data/mcp/wt` subcommands to oclif
8. [ ] **MCP**: implement `mcp-client` connectivity and `mcp-server` tool exposure (worktree/observability/policies)
9. [ ] **Observability**: wire OTel + Pino (spans for engine, sessionId, turns, `duration_ms`, etc.)
10. [ ] **Tests**: Vitest unit/integration + e2e (CLI/SSE/WebSocket/MCP)
11. [ ] **CI**: implement lint/typecheck/test/build/e2e/size in GitHub Actions
12. [ ] **Docs**: refresh README/AGENTS/SSOT/CHANGELOG/PLANS
13. [ ] **Cleanup**: remove Python/FastAPI/uv, redundant tests, scripts, and unused samples
14. [ ] **Cut 2.0.0**: tag release and publish notes

## Validation and Acceptance
- CLI defaults execute MAG/SAG without API keys (subscription sign-in only)
- MAG/SAG roles can be swapped via environment variables or CLI flags (e.g., MAG=`claude-cli`, SAG=`codex-cli`)
- API mode runs OpenAI Agents, Claude Agent, and ADK successfully
- MCP client/server interoperability validated
- CI passes lint/typecheck/unit/integration/e2e/size gates
- Documentation updated; `git status` clean

## Idempotence and Recovery
- `pnpm clean && pnpm -r build` is deterministic
- Schema/type generation is repeatable
- Database/storage flows remain idempotent (SQLite/Better-sqlite3)

## Artifacts and Notes
- OpenAPI and type artifacts, CI logs, test reports, sample session transcripts (SSE/WebSocket)

## Interfaces and Dependencies
- Node 22+, pnpm 9+, git 2.44+
- codex CLI (requires ChatGPT subscription sign-in), claude CLI (requires Claude subscription sign-in)
