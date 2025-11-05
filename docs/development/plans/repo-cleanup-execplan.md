---
title: MAG/SAG Parallelization ExecPlan
slug: mag-sag-parallelization
status: completed
last_updated: 2025-11-05
last_synced: '2025-11-05'
tags:
- plans
- development
- agents
summary: Deliver a minimal multi-SAG orchestration loop with subscription-first engines and lightweight observability.
description: Establishes the steps to evolve the MAG/SAG framework so a single MAG orchestrates up to ten concurrent SAG runs, backed by git-worktree isolation, CLI controls, and baseline run metrics without inflating code complexity.
authors: []
sources:
- id: R1
  title: MAGSAG Agent Playbook
  url: ../../AGENTS.md
  accessed: '2025-11-05'
- id: R2
  title: Single Source of Truth
  url: ../../SSOT.md
  accessed: '2025-11-05'
---

# MAG/SAG Parallelization Plan

## Purpose
- Enable one MAG instance to orchestrate multiple SAGs for a single task while keeping logic lean and testable.
- Respect the subscription-first engine strategy and ensure API fallbacks remain pluggable.
- Produce a reusable execution baseline that future observability and policy gates can extend without rework.

## Context
- Current orchestration assumes a mostly sequential MAG↔SAG exchange; parallel execution is not codified.
- CLI tooling lacks controls for concurrency, provider selection, and tracing of per-run artifacts.
- Worktree utilities exist but are not consistently applied when spawning SAG workspaces.
- Minimal observability (usage, completion state) is sufficient for the first milestone; avoid heavy pipelines.

## Objectives
1. Define simple, type-safe contracts for multi-SAG delegation and event streaming under `@magsag/core`.
2. Implement a MAG scheduler that caps concurrent SAG executions at ten and coordinates lifecycle events.
3. Leverage git worktrees to create isolated sandboxes per SAG delegation with automatic cleanup.
4. Extend the CLI to configure concurrency, provider maps, and to stream run status.
5. Emit lightweight observability signals (status, usage, deliverables) that downstream tooling can consume.

## Completion Status
- ✅ Workstream A delivered updated agent contracts plus the shared `TaskQueue`, and the delegation lifecycle is now documented in `docs/architecture/agents.md`.
- ✅ Workstream B refactored `SimpleManager` to schedule subtasks with a bounded queue and parallel lifecycle tests.
- ✅ Workstream C wraps runner packages via `RunnerSpecialistAgent`, provisions per-run worktrees, and tears them down safely.
- ✅ Workstream D ships CLI `agent plan`, `agent exec`, and `runs describe` with concurrency controls, provider maps, and persisted run logs.
- ✅ Workstream E captures JSONL run events through `RunLogCollector` and replays summaries, exposing minimal observability metrics.

## Workstreams and Tasks

### A. Contract and Queue Foundations
1. Update `ManagerAgent`/`SpecialistAgent` interfaces to support multiple simultaneous delegations while preserving backwards compatibility.
2. Introduce a minimal `TaskQueue` utility (Promise-based) with concurrency controls and cancellation hooks.
3. Document the delegation lifecycle, including expected `RunnerEvent` payloads and error handling semantics.

### B. MAG Scheduler and Lifecycle
1. Refactor MAG orchestration to use the shared queue, dispatching subtasks to idle SAGs up to the max concurrency.
2. Ensure the MAG aggregates events, enforces Definition of Done, and handles retries without branching logic bloat.
3. Add integration tests that cover parallel delegations and verify graceful completion on cancellations or failures.

### C. SAG Execution Surface
1. Wrap existing `runner-*` packages with the simplified `SpecialistAgent` contract; avoid duplicating engine logic.
2. Guarantee each SAG execution receives an isolated git worktree created via `@magsag/worktree` helpers.
3. Add teardown safeguards so failed SAG runs still clean up worktrees and ephemeral state.

### D. CLI Enhancements
1. Update `@magsag/cli` to accept `--concurrency`, `--provider-map`, and `--worktree-root` flags.
2. Provide `plan` and `exec` subcommands that surface per-subtask status and stream `RunnerEvent` data.
3. Document new CLI usage in `README.md` and ensure help output reflects subscription-first defaults.

### E. Minimal Observability
1. Extend `@magsag/observability` to collect run-level metrics: start/stop timestamps, status, and usage summaries.
2. Emit JSONL run logs stored alongside worktree artifacts for quick audits.
3. Add a CLI `runs describe <id>` command that replays aggregated events without introducing external services.

## Milestones
1. Contracts and queue utilities merged with unit coverage.
2. MAG scheduler exercising parallel delegations in integration tests.
3. SAG adapters operating inside git worktree sandboxes with cleanup verified.
4. CLI release supporting concurrency flags and streaming output.
5. Observability baseline producing usage snapshots and replayable run logs.

## Validation
- `pnpm -r lint`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm docs:lint`
- Manual: Launch a task via CLI with `--concurrency 4`, observe concurrent SAG execution, verify run logs and worktree cleanup.

## Risks and Mitigations
- **Complexity creep**: keep queue and scheduler utilities under 200 LOC; defer advanced policies to future plans.
- **Resource contention**: guard worktree creation with unique identifiers and enforce cleanup in finally blocks.
- **Provider limits**: budget guards remain simple counters; escalate to API fallbacks if subscription CLIs exceed quotas.

## Update Log
- 2025-11-05: Marked Workstreams A–E complete and recorded delivered CLI, manager, specialist, and observability surfaces.
- 2025-11-05: Plan authored to guide MAG/SAG parallelization and minimal observability rollout.
