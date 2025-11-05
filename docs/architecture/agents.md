---
title: MAGSAG Agent Guidelines
slug: architecture-agents
status: living
last_updated: 2025-11-04
last_synced: '2025-11-04'
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
4. Record executed commands and their results (lint, typecheck, test, manual doc review).
5. Stage related files only (`git add -u`), avoiding drive-by edits.

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
- `packages/cli/src/commands/` – CLI entry points (agent run, flow tooling).
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
- MCP presets live in `tools/adk/servers/*.yaml`. Regeneration tooling is pending TypeScript replacement—log any manual JSON generation steps and notify Workstream E.

## Update Log

- 2025-11-04: Replaced Python/uv guidance with TypeScript + pnpm instructions, refreshed MCP preset path to `tools/adk/servers/`, and updated package references.
- 2025-11-03: Documented external SDK drivers, ADK sync workflow, and governance guardrails.
- 2025-11-02: Linked workflow and taxonomy references for documentation alignment.
