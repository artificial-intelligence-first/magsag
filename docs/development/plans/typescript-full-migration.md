---
title: ExecPlan — TypeScript Full Migration (Big Bang)
slug: typescript-full-migration
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
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
- https://github.com/google/adk
---

# ExecPlan: TypeScript Full Migration (Big Bang)

## Purpose / Big Picture
- Deliver **MAGSAG 2.0** as a **TypeScript-only** monorepo with **CLI-default execution** (subscription-first via Codex/Claude CLIs) and optional API mode (OpenAI Agents / Claude Agent SDK / Google ADK). MAG/SAG roles remain swappable per engine.

## To-do
- [ ] Create monorepo scaffold (pnpm + turborepo + Node 22)
- [ ] Port core, schema, CLI, server, governance, observability, worktree to TypeScript
- [ ] Implement runners: **codex-cli (default)**, **claude-cli (default)**, openai-agents (opt-in), claude-agent (opt-in), adk (opt-in)
- [ ] Add MCP: client + server packages
- [ ] Migrate tests to Vitest; add e2e (CLI/SSE/WS/MCP)
- [ ] GitHub Actions CI (lint/typecheck/test/build/e2e/size)
- [ ] Rewrite docs (README/AGENTS/SSOT/CHANGELOG/PLANS)
- [ ] **Remove Python/FastAPI/uv/legacy** and tag **v2.0.0**

## Parallel Execution Readiness
### Branch / Worktree Rules
1. Create worktrees manually (`git worktree add ../wt-<id>-typescript-full-migration main`). Record the command in hand-off notes until the TypeScript worktree utility ships.
2. Branch naming: `feature/ts-migration/<workstream>/<short-desc>`; CI tasks use `ci/ts-migration/<desc>`. Shared dependency changes flow through `integration/ts-migration/shared`.
3. Notify other workstreams before merging shared schema or utility updates; avoid conflicting edits by sequencing merges.
4. Minimum validation: `pnpm --filter <pkg> lint typecheck test`. Escalate to `pnpm -r typecheck` → `pnpm -r test` when cross-package impact is expected.

### Workstream Breakdown
#### Workstream A — MCP First-class Support
- **Scope**: `@magsag/mcp-client` (complete), `@magsag/mcp-server`, CLI/runner registry integration, removal of Python MCP bits.
- **Dependencies**: Runner/CLI IPC contracts; server SSE/WS specs from Workstream C.
- **Deliverables**: TypeScript MCP server/client, stdio/SSE/HTTP/WebSocket support, fixtures for connectivity tests.
- **DoD**:
  - `pnpm --filter @magsag/mcp-server lint typecheck test`
  - CLI `agent run` fetches tools via MCP
  - Python MCP implementation removed; all Vitest suites pass

#### Workstream B — Core Subsystems Rewrite
- **Scope**: `packages/core`, `packages/worktree`, `packages/governance`, `packages/observability`, `packages/storage`.
- **Dependencies**: MCP types (Workstream A), server events (Workstream C).
- **Deliverables**: Zod-based policy types, OpenTelemetry + Pino observability, storage abstraction.
- **DoD**:
  - `pnpm --filter <pkg> lint typecheck test` for each package
  - Shared types centralized in `@magsag/schema`
  - Observability events accessible from server/CLI integration tests

#### Workstream C — Server Finishing
- **Scope**: `@magsag/server` SSE/WS, MAG/SAG switching, OpenAPI generation, metrics endpoint.
- **Dependencies**: Contracts from Workstream A/B.
- **Deliverables**: `/api/v1/agent/run` (HTTP/SSE/WS), OpenAPI artifact, telemetry surface.
- **DoD**:
  - `pnpm --filter @magsag/server lint typecheck test`
  - Deterministic OpenAPI build via `pnpm --filter @magsag/server build`
  - At least one SSE/WS integration test

#### Workstream D — Tests & CI
- **Scope**: Vitest unit/integration/e2e, GitHub Actions pipelines (lint/typecheck/test/build/e2e/size), artifact uploads.
- **Dependencies**: Packages stabilized by Workstreams A–C, documentation commands from Workstream E.
- **Deliverables**: `pnpm -r test` green baseline, `.github/workflows/ts-mono-ci.yml`, size check.
- **DoD**:
  - `pnpm vitest --run` (all scopes), `pnpm --filter docs lint` or equivalent
  - Workflows for lint/typecheck/test/build/e2e/size passing
  - Artifacts captured for OpenAPI and CLI help

#### Workstream E — Docs & Governance
- **Scope**: README, AGENTS, SSOT, CHANGELOG, PLANS, catalog templates, frontmatter compliance.
- **Dependencies**: API endpoints, commands, and configuration semantics from other workstreams.
- **Deliverables**: Updated docs with frontmatter, taxonomy alignment, doc lint tooling.
- **DoD**:
  - `pnpm --filter docs lint` (or replacement once TypeScript doc tooling is ready)
  - SSOT cross-links verified
  - CHANGELOG `## [Unreleased]` populated with user-facing updates

#### Workstream F — Legacy Cleanup & Release
- **Scope**: Python/FastAPI/uv removal, duplicate scripts cleanup, `pnpm -r build/lint/test`, 2.0.0 release prep.
- **Dependencies**: Workstreams A–E merged into main.
- **Deliverables**: TypeScript-only repo, release notes draft, annotated tag.
- **DoD**:
  - `pnpm -r build`, `pnpm -r lint`, `pnpm -r test`
  - Dry-run tag: `git tag -a v2.0.0 <sha>` then `git tag -d v2.0.0`
  - ExecPlan Outcomes & Retrospective updated

### Coordination Checklist
- Log workstream transitions (start / pause / finish) in Progress with timestamps.
- Record schema/API/observability contract changes in `Surprises & Discoveries` and broadcast to impacted workstreams.
- For shared branches, merge into `integration/ts-migration/shared` before distributing.
- When updating `@magsag/schema`, bump prerelease version references and document in the CHANGELOG and ExecPlan.

## Progress
- 2025-11-03T00:00:00Z — Plan created.
- 2025-11-03T17:30:00Z — Ported MCP client resilience layer to TypeScript (`@magsag/mcp-client`); circuit breaker and transport integration covered by Vitest.
- 2025-11-03T17:40:00Z — Next target: `@magsag/mcp-server` with SDK wiring and end-to-end CLI integration.
- 2025-11-03T18:00:00Z — Established parallel execution board (`docs/development/plans/typescript-full-migration-workstreams.md`) with branch/worktree conventions and DoD checklists.
- 2025-11-03T18:05:00Z — Workstream A assigned (branch `wt/ts-migration-a/typescript-full-migration`, worktree `.worktrees/wt-ts-migration-a-typescript-full-migration-6abadd3`).
- 2025-11-03T18:08:00Z — Provisioned worktrees B–F (`.worktrees/wt-ts-migration-{b..f}-typescript-full-migration-6abadd3`) with placeholder branches.
- 2025-11-03T19:36:40Z — Resolved `@magsag/cli` build issues via tsconfig path aliases and tsup external configuration.
- 2025-11-04T10:15:00Z — Removed Python runtime, Typer CLI, legacy tests, benches, and docs; migrated README/AGENTS/SSOT to TypeScript-first guidance; documented manual doc/policy checks pending tooling handoff to Workstream E.

## Decision Log
- 2025-11-03T00:00:00Z — Big-bang migration (no phased rollout).
- 2025-11-03T00:00:00Z — CLI-first default; API mode optional.
- 2025-11-03T00:00:00Z — MAG/SAG roles configurable by engine.
- 2025-11-04T10:00:00Z — Temporary manual process for doc/policy validation until TypeScript tooling lands (Workstream E action item).

## Surprises & Discoveries
- Removing the Python runtime eliminated `ops/tools/*.py` validators. Until TypeScript replacements are available, doc/policy checks require manual review. Log outcomes in delivery notes and coordinate with Workstream E.
- Flow Runner governance helpers were coupled to the Python CLI. Runners now rely on TypeScript flow-gate logic; Flow Runner parity work remains on the backlog (Workstream F to coordinate with A/B).

## Outcomes & Retrospective
- Pending once Workstream F completes the release.

## Context and Orientation
- Legacy layers: Typer CLI / FastAPI / governance / observability / catalog / worktree utilities (Python).
- Target architecture: TypeScript monorepo (`packages/`, `apps/`, `docs/`, `catalog/`, `tests/`), Node 22, pnpm 9, turborepo.
- External SDKs:
  - OpenAI Agents: `@openai/agents`
  - Claude Agent SDK: `@anthropic-ai/claude-agent-sdk`
  - Google ADK: `@google/adk`
  - MCP TypeScript SDK: `@modelcontextprotocol/sdk`

### Execution Modes (ENV Matrix)
- `ENGINE_MODE` = `subscription` | `api` | `oss`
  - `subscription` (default) → CLI runners (Codex/Claude)
  - `api` → OpenAI/Anthropic/ADK SDK runners (requires keys)
- `ENGINE_MAG`, `ENGINE_SAG` = `codex-cli` | `claude-cli` | `openai-agents` | `claude-agent` | `adk`
  - Recommended default: `ENGINE_MAG=codex-cli`, `ENGINE_SAG=claude-cli`

### API Contract (`/api/v1/agent/run`)
- Input: `RunSpec` (engine, repo, prompt, optional resumeId, optional extra metadata)
- Output: stream of `RunnerEvent` objects (`log`, `message`, `diff`, `tool-call`, `done`, `error`) via SSE/WS/HTTP chunked responses.

## Plan of Work
1. Bootstrap monorepo configuration (pnpm workspace, turbo, tsconfig, eslint config)
2. Implement core/schema (Zod + OpenAPI, runner interfaces, events)
3. Implement CLI runners (codex-cli, claude-cli) and optional API runners
4. Implement server (Hono/Fastify evaluation) + CLI (oclif)
5. Implement MCP client/server
6. Build observability (OTel + Pino, flow summaries)
7. Write tests (Vitest unit/integration/e2e) and CI pipelines
8. Update docs and governance surfaces
9. Remove legacy Python assets and cut v2.0.0

## Concrete Steps
1. [ ] Scaffold: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `eslint.config.js`, `.prettierignore`
2. [ ] Package shells: `@magsag/core`, `@magsag/schema`, `@magsag/cli`, `@magsag/server`, `@magsag/worktree`, `@magsag/governance`, `@magsag/observability`, `@magsag/runner-*`, `@magsag/mcp-*`
3. [ ] Core/schema: define runner interfaces, events, and schema exports
4. [ ] Default runners: codex-cli (NDJSON), claude-cli (stream-json)
5. [ ] Optional runners: openai-agents, claude-agent, adk
6. [ ] Server: `/api/v1/agent/run`, `/api/v1/sessions/*`, `/openapi.json`
7. [ ] CLI: oclif commands for flow/agent/data/mcp/worktree
8. [ ] MCP: client transports + server surface
9. [ ] Observability: metrics and flow summaries
10. [ ] Tests: Vitest + e2e harness
11. [ ] CI: GH Actions workflows for lint/typecheck/test/build/e2e/size
12. [ ] Docs: rewrite README/AGENTS/SSOT/CHANGELOG/PLANS
13. [ ] Cleanup: remove Python/FastAPI/tests/scripts/dead samples
14. [ ] Release: prepare notes and tag v2.0.0

## Validation and Acceptance
- Subscription mode works with Codex/Claude CLIs without API keys.
- MAG/SAG roles configurable via env/CLI.
- API mode operates with OpenAI/Anthropic/ADK runners.
- MCP client/server interoperate with catalog assets.
- CI covers lint/typecheck/unit/integration/e2e/size.
- Docs refreshed; repository clean for tagging.

## Idempotence and Recovery
- `pnpm clean && pnpm -r build` is deterministic.
- Schema/type generation is repeatable.
- No database migrations; storage is file-based for now.

## Artifacts and Notes
- OpenAPI spec, CLI help, test reports, SSE/WS transcripts, release notes.
