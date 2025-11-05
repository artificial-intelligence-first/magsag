---
title: MAGSAG Agent Guidelines
slug: architecture-agents
status: living
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- agents
- workflow
summary: Detailed operating procedures for contributors working inside the TypeScript MAGSAG monorepo.
description: Deep dive into the TypeScript packages, tooling, and governance expectations that drive agent contributions.
authors: []
source_of_truth: https://github.com/artificial-intelligence-first/ssot
sources:
- id: R1
  title: MAGSAG Agent Playbook
  url: ../../AGENTS.md
  accessed: '2025-11-04'
- id: R2
  title: MAGSAG README
  url: ../../README.md
  accessed: '2025-11-04'
---

# MAGSAG Agent Guidelines

> **For Humans**: Use this guide to understand the TypeScript monorepo layout, required tooling, and governance hooks that shape daily work.
>
> **For AI Agents**: Mirror these procedures when editing code or docs. Pause when instructions conflict and surface ambiguities early.

## Overview

This guide expands on `AGENTS.md` with deeper context about packages, validation routines, and governance expectations in the TypeScript (pnpm) monorepo.

## Environment Essentials

- Install Node.js 18.18+ (22.x LTS recommended) and pnpm 9.
- Run `pnpm install` per worktree to sync dependencies.
- TypeScript packages live under `packages/` (CLI, core, governance, observability, runners, MCP, shared logging, worktree utilities).
- Catalog assets remain under `catalog/`; docs stay under `docs/`.
- Execute CLI commands with `pnpm --filter @magsag/cli exec magsag <command>`.
- Regenerate MCP wrappers and SKILL metadata with `pnpm mcp:codegen`; verify no drift with `pnpm mcp:codegen --check` during reviews.
- Manual worktrees: `git worktree add ../wt-<id>-cleanup main` until the TypeScript worktree utility lands. Document the command in hand-off notes.
- Engine defaults: `ENGINE_MODE=subscription`, `ENGINE_MAG=codex-cli`, `ENGINE_SAG=claude-cli`. Override per run when testing API engines.

## Architecture Snapshot

```
┌──────────────────────────────────────────────────────────────┐
│                           Interfaces                         │
│   CLI (oclif)                        GitHub/CI (planned)      │
└───────────────┬──────────────────────────────┬────────────────┘
                │                              │
                ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│                 Orchestration & Governance                    │
│  Runner registry ─ governance policies ─ worktree utilities  │
│  CLI commands  ─ MCP client  ─ session management            │
└──────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 Execution & Observability                    │
│  Runners (Codex, Claude, OpenAI Agents, ADK)                 │
│  Catalog assets + MCP providers                              │
│  Observability (summaries, metrics, logs)                    │
└──────────────────────────────────────────────────────────────┘
```

## Repository Layout (TypeScript)

```
packages/             → TypeScript packages (cli, core, governance, observability, runners, mcp, shared-logging, worktree)
catalog/              → Agents, skills, schemas, policies
docs/                 → Architecture notes, workflows, governance guides
ops/adk/              → MCP server definitions (YAML)
apps/                 → Demo entry points (placeholder CLI/API)
examples/             → Reference flows and snippets
servers/              → Generated MCP tool wrappers (`pnpm mcp:codegen`)
skills/               → Generated SKILL metadata (one `SKILL.md` per catalog skill)
```

## Required Checks Before Any PR

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

- Narrow scope with `pnpm --filter @magsag/<pkg> lint|typecheck|test` for targeted packages.
- Capture docs and catalog validation via `pnpm docs:lint` / `pnpm catalog:validate`; record results in delivery notes.

## Change Workflow

1. Create an isolated worktree (`git worktree add ...`) and note it in hand-off docs.
2. Implement changes with strict typing and focused tests.
3. Update documentation, SSOT entries, or catalog artefacts affected by behaviour changes.
   - When MCP presets change, run `pnpm mcp:codegen` and commit regenerated `servers/**` and `skills/**` artefacts alongside code updates.
   - Import generated wrappers through `@magsag/servers/<serverId>` instead of deep relative paths so code stays stable when directory depth shifts.
4. Record executed commands and their results (lint, typecheck, test, manual doc review).
5. Stage related files only (`git add -u`), avoiding drive-by edits.

## Workspace Sandbox Controls

- MAG/SAG runners create an `ExecutionWorkspace` per run. Configure behaviour with CLI flags (`--workspace-base`, `--workspace-keep`, `--workspace-memory`, `--workspace-cpu`, `--workspace-timeout`) or the matching `MAGSAG_WORKSPACE_*` environment variables.
- Resource ceilings enforce CPU time, resident memory, and wall-clock budgets; breaches terminate the child process and surface a masked `workspace` log event.
- The sandbox writes masked audit entries (`audit.log`) using the shared PII tokenizer so sensitive values never reach model-visible channels.
- Runner events now include an optional `channel` field (`workspace`, `stdout`, `stderr`) allowing downstream consumers to route logs or redact them as needed.

## MAG/SAG Delegation Lifecycle

- **State events**: `SimpleManager` emits `DelegationEvent` updates in the order `queued` → `running` → (`completed` | `failed`). Dependent subtasks that cannot start after an upstream failure receive a terminal `state=failed` event and a matching `status=skipped` result payload.
- **Runner stream**: Each `RunnerSpecialistAgent` forwards the underlying `RunnerEvent` flow (`log`, `message`, `diff`, `tool-call`, `flow-summary`, `done`, `error`). These surface in the CLI via `renderRunnerEvent` and are persisted by `RunLogCollector` to JSONL.
- **Result aggregation**: Every subtask ends with a `result` event containing `status`, optional `detail`, and any `usage` stats captured from `RunnerEvent.type === 'done'`. Usage metrics enter the run summary under the originating subtask ID.
- **Error propagation**: Failures during `prepareDelegation` (e.g., worktree provisioning) short-circuit execution, emitting `state=failed` and a failed result without invoking a runner. Exceptions thrown inside a specialist become `state=failed` + `result.status=failed`, and downstream subtasks are skipped with the same detail string.
- **Cancellation**: Abort signals trigger `TaskQueue.cancelAll`, causing in-flight subtasks to raise an `AbortError` and pending work to reject with the shared reason; observers record these as failed results with the cancellation message.

## Governance Expectations

- Never commit secrets. Use environment variables or the secret solutions referenced in `docs/policies/security.md`.
- Keep naming consistent with the `@magsag/*` package family.
- Update `CHANGELOG.md` under `## [Unreleased]` for user-visible changes.
- Use ExecPlans (`docs/development/plans/`) for multi-session work and close them with validation notes once delivered.

## When to Pause

- Requirements conflict with `SSOT.md` or governance policies.
- Destructive actions (rewriting history, purging data) are requested without explicit approval.
- Subscription/API engines fail and no fallback is defined.
- Security or governance expectations are ambiguous.

## Reference Surfaces

- `packages/core/src/index.ts` – engine contracts and runner registry helpers.
- `packages/cli/src/commands/` – CLI entry points (`agent plan`, `agent exec`, `runs describe`, flow tooling).
- `packages/runner-*/src/index.ts` – Codex, Claude, OpenAI Agents, Claude Agent, and ADK runners.
- `packages/mcp-client/src/` – MCP transport helpers and circuit breaker.
- `packages/governance/src/flow-gate.ts` – flow summary evaluation logic.
- `packages/observability/src/flow-summary.ts` – flow aggregation and metrics.
- `docs/workflows/` – changelog and ExecPlan operations.
- `docs/governance/` – style, taxonomy, and frontmatter guidance.
- `catalog/registry/` – agent and skill registry definitions.

## External Execution Drivers

- CLI defaults rely on subscription runners; switch to API engines by exporting `ENGINE_MODE=api` and selecting `ENGINE_MAG` / `ENGINE_SAG` accordingly.
- `packages/runner-claude-agent` and `packages/runner-openai-agents` bridge SDK integrations; ensure credentials are set before executing.
- MCP presets live in `tools/adk/servers/*.yaml`. Regenerate typed wrappers with `pnpm mcp:codegen` (add `--check` in CI) so skills and SKILL docs stay in sync.

## Update Log

- 2025-11-06: Documented workspace sandbox controls, MCP code generation workflow, channel-aware runner logs, and SKILL metadata requirements.
- 2025-11-05: Documented MAG/SAG delegation lifecycle, RunnerEvent handling, and cancellation semantics.
- 2025-11-04: Replaced Python/uv guidance with TypeScript + pnpm instructions, refreshed MCP preset path to `tools/adk/servers/`, and updated package references.
- 2025-11-03: Documented external SDK drivers, ADK sync workflow, and governance guardrails.
- 2025-11-02: Linked workflow and taxonomy references for documentation alignment.
