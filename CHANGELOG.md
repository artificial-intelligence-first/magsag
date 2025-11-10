---
title: MAGSAG Changelog
slug: changelog
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- magsag
- changelog
- releases
- semver
summary: Release history for the MAGSAG framework following Keep a Changelog and SemVer.
description: Release history for the MAGSAG framework following Keep a Changelog and
  SemVer.
authors: []
sources:
- id: R1
  title: Keep a Changelog 1.1.0
  url: https://keepachangelog.com/en/1.1.0/
  accessed: '2025-11-01'
- id: R2
  title: Semantic Versioning 2.0.0
  url: https://semver.org/spec/v2.0.0.html
  accessed: '2025-11-01'
---

# Changelog

> **For Humans**: Track noteworthy MAGSAG changes here. Every entry explains user-facing impact, links to issues or docs, and follows SemVer semantics.
>
> **For AI Agents**: Update the `Unreleased` section whenever you ship a meaningful behaviour change. Do not create tagged releases without human approval.

## Overview

- Format: [Keep a Changelog][keepachangelog]
- Versioning: [Semantic Versioning][semver]
- Scope: CLI, API, runners, catalog assets, docs, and governance updates that affect project users.

[keepachangelog]: https://keepachangelog.com/en/1.1.0/
[semver]: https://semver.org/spec/v2.0.0.html

## How to Use This File

1. Append user-facing updates under `## [Unreleased]` with the correct category (`Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`).
2. When preparing a release, move curated entries into a new version section with an ISO 8601 date.
3. Update comparison links at the end of the file to keep GitHub diff references accurate.

## Release Notes

### [Unreleased]

#### Added
- `/api/v1/sessions` and `/openapi.json` endpoints backed by an in-memory session store so runs can be inspected and replayed without the legacy Python API.
- `docs/development/plans/repo-cleanup-execplan.md` to coordinate TypeScript cleanup, MCP alignment, and Workstreams A–F follow-ups.
- Workspace sandbox for MAG/SAG runners with CPU/memory/wall-clock limits, audit log capture, and masked log channels surfaced via new workspace CLI flags.
- `@magsag/mcp-codegen` pipeline (`pnpm mcp:codegen`) generating typed MCP wrappers, skill metadata, and SKILL docs under `skills/<name>/SKILL.md`.
- CLI commands `mcp search` and `mcp browse` to locate MCP tools and browse filesystem presets without streaming full tool catalogs.
- PII tokenisation middleware shared across workspaces to mask sensitive payloads before they reach model-visible logs.

#### Changed
- Replaced legacy Python/FastAPI/uv assets with TypeScript implementations (new `@magsag/catalog` package, updated ops tooling).
- CLI build now externalises workspace dependencies, allowing `pnpm --filter @magsag/cli exec node dist/index.js` to resolve bundled imports.
- `pnpm test:e2e` / `ci:e2e` invoke the shared Vitest configuration to cover both CLI/server end-to-end suites.
- CI helper scripts (`ci:lint`, `ci:typecheck`, `ci:build`, `ci:test`) now execute across the entire workspace.
- Archived legacy Python documentation for handoff and memory flows while TypeScript replacements are prepared.
- Catalog skills now consume generated MCP modules via `callMcpTool`/`createPostgresQuery`, eliminating direct `executeTool` usage and enabling lazy MCP client caching.
- Raised the documented and enforced Node.js baseline to 20+ to align with the Vitest 4 toolchain.

#### Removed
- Retired Python doc tooling and scripts in favour of `pnpm docs:lint` and `pnpm catalog:validate` ahead of the v2.0.0 tag.
- Deleted stray Node.js skill implementations under `catalog/skills/**/impl` that were superseded by the TypeScript catalog modules.

#### Fixed
- Restored accurate Vitest coverage enforcement by expressing global thresholds as percentages (80/70/75/80), ensuring CI fails when statement, branch, function, or line coverage dips below the documented targets.
- Rate limiter now keys requests by the actual socket address (via `context.env.incoming`) whenever proxy headers are disabled, preventing all traffic from sharing a single `anonymous` bucket and keeping the `trustForwardedHeaders` flag meaningful.

### [2.0.0] - 2025-11-04

#### Added
- TypeScript-only monorepo managed by pnpm/turborepo with shared ESLint and TS configs.
- `@magsag/cli` (oclif) exposing MAG/SAG runners, engine overrides, and resumable sessions.
- Governance/observability/runner/MCP/shared-logging packages refactored to TypeScript ESM.
- Workstream coordination docs and README/AGENTS/SSOT refreshed for subscription-first defaults.

#### Changed
- Default workflow uses `pnpm install`, `pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`.
- Engine environment variables renamed to `ENGINE_MODE`, `ENGINE_MAG`, and `ENGINE_SAG`; docs updated accordingly.
- Claude/Codex CLI runners hardened against unsafe assignments and unnecessary conditions.
- Flow summary evaluation aligns with new schema helpers and emits stricter model/policy checks.

#### Removed
- Python/FastAPI/uv runtime, Typer CLI, legacy tests/benchmarks, and flowrunner wrappers.
- Automated doc/policy validators (legacy `ops/tools/*.py`) replaced by TypeScript commands (`pnpm docs:lint`, `pnpm catalog:validate`).
- Vendored MCP artefacts produced by the Python toolchain; MCP sync is temporarily manual.

#### Known Gaps
- Documentation and policy checks rely on manual review (see ExecPlan Surprises). Workstream E is tracking the replacement.
- Flow Runner governance tooling is pending; record interim validation steps in delivery notes.

### [0.2.0] - 2025-10-31

#### Added
- **Approval-as-a-Policy**: Human oversight for critical agent actions with policy-driven permission evaluation
  - Permission evaluator with YAML-based policies (ALWAYS/REQUIRE_APPROVAL/NEVER)
  - Approval ticket lifecycle management with TTL and expiration handling
  - REST API endpoints: `GET/POST /api/v1/runs/{run_id}/approvals/{approval_id}`
  - Server-Sent Events (SSE) for real-time approval status updates
  - Integration with approval gate for tool execution governance (#102)
  - Documentation: [docs/approval.md](./docs/approval.md)

- **Durable Run**: Snapshot/restore capabilities for restart resilience
  - Automatic checkpointing at step boundaries
  - State restoration from latest or specific checkpoint
  - Step-level idempotency with `(run_id, step_id)` uniqueness
  - Multiple storage backends: file-based, SQLite, PostgreSQL
  - `DurableRunner` and `SnapshotStore` implementations (#102)
  - Documentation: [docs/durable-run.md](./docs/durable-run.md)

- **Handoff-as-a-Tool**: Standardized agent delegation interface
  - Multi-platform support: MAGSAG, ADK, OpenAI, Anthropic
  - Platform-specific adapters with automatic format translation
  - Policy enforcement with approval gate integration
  - Request tracking and audit trail
  - Tool schema export for LLM integration (#102)
  - Documentation: [docs/handoff.md](./docs/handoff.md)

- **Memory IR Layer**: Structured persistent memory for agents
  - `MemoryEntry` model with scope (SESSION/LONG_TERM/ORG) and TTL management
  - PII tag validation and vector embedding support
  - SQLite and PostgreSQL storage backends with FTS5 full-text search
  - Retention policies and automatic expiration (#102)
  - Documentation: [docs/memory.md](./docs/memory.md)

- **Remote MCP Client**: Async client for external MCP servers
  - Circuit breaker pattern for fault tolerance
  - Exponential backoff with jitter for retries
  - Multiple transport support: stdio, WebSocket, HTTP
  - Integration with skill runtime (#102)
  - Documentation: [docs/mcp.md](./docs/mcp.md)

- **Feature Flags**: Backward-compatible rollout for all v0.2 features
  - `APPROVALS_ENABLED`, `MCP_ENABLED`, `DURABLE_ENABLED`, `HANDOFF_ENABLED`, `MEMORY_ENABLED`
  - All features default to disabled for opt-in adoption

#### Changed
- Extended API config with v0.2 enterprise feature flags and settings
- Enhanced storage schema with `approvals`, `snapshots`, and `memory_entries` tables
- Updated FastAPI server to include approval routes
- Improved observability with approval, checkpoint, and handoff events

#### Fixed
- Enhanced error handling for approval timeouts and denials
- Improved idempotency for snapshot writes and approval tickets

### [0.1.0] - 2025-10-30

#### Added
- Initial public release of the MAGSAG framework with Typer CLI (`magsag`) covering flow, agent, data, and MCP commands.
- FastAPI HTTP API with custom error formatting, rate limiting hooks, and `/health` endpoint.
- Agent runner orchestrating MAG/SAG lifecycles, skill delegation, evaluation hooks, and observability logging.
- Catalog-driven assets for agents, skills, routing, governance, and evaluation metrics.
- Observability stack including JSONL + SQLite cost tracking, OpenTelemetry bootstrap, and run summarisation.

#### Changed
- Standardised repository documentation to align with SSOT templates (AGENTS, CONTRIBUTING, PLANS, README, SKILL, SSOT).

## Maintenance Notes

- Always include links to relevant issues/PRs where possible, e.g. `(#123)`.
- Document schema or policy changes that require downstream updates (docs, contracts, infrastructure).
- If a change is purely internal, mention it under `Changed` only when it affects contributor workflows.

## Links

- [Unreleased]: https://github.com/artificial-intelligence-first/magsag/compare/v2.0.0...HEAD
- [2.0.0]: https://github.com/artificial-intelligence-first/magsag/compare/v0.2.0...v2.0.0
- [0.2.0]: https://github.com/artificial-intelligence-first/magsag/compare/v0.1.0...v0.2.0
- [0.1.0]: https://github.com/artificial-intelligence-first/magsag/releases/tag/v0.1.0

## Update Log

- 2025-10-30: Established MAGSAG changelog with initial 0.1.0 entry.
