---
title: MAGSAG Agent Guidelines
slug: architecture-agents
status: living
last_updated: 2025-11-01
last_synced: '2025-11-01'
tags:
- magsag
- agents
- workflow
summary: Detailed operating procedures for contributors working inside the MAGSAG
  repository.
authors: []
source_of_truth: https://github.com/artificial-intelligence-first/ssot/blob/main/docs/core/agents-guide.md
sources:
- id: R1
  title: MAGSAG Agent Playbook
  url: ../../AGENTS.md
  accessed: '2025-11-01'
description: Detailed operating procedures for contributors working inside the MAGSAG
  repository.
---

# MAGSAG Agent Guidelines

> **For Humans**: Use this guide to understand the repository layout, required tooling, and governance hooks that shape daily work.
>
> **For AI Agents**: Mirror these procedures when editing code or docs. Ask for clarification when instructions conflict.

## Overview

This guide expands on `AGENTS.md` with deeper context about the development environment, architecture, and validation routines that keep changes safe and traceable.

## Environment Essentials

- Use Python 3.12 with [`uv`](https://docs.astral.sh/uv/) for dependency
  management: `uv sync --extra dev`.
- Source code lives under `src/magsag/`, catalog assets under `catalog/`, docs in
  `docs/`. Keep new modules inside `src/magsag/` unless instructed otherwise.
- The Typer CLI is the primary entry point: `uv run magsag --help`.
- Run the API server locally with `uv run python -m magsag.api.server`.
- Configuration is namespaced by `MAGSAG_`; defaults are in
  `magsag.api.config.Settings`.

## Architecture Snapshot

```
┌──────────────────────────────────────────────────────────────┐
│                          Interfaces                          │
│   Typer CLI (wt/agent/flow)  FastAPI API  GitHub Hooks & Jobs │
└───────────────┬────────────────────┬──────────────────────────┘
                │                    │
                ▼                    ▼
┌──────────────────────────────────────────────────────────────┐
│                 Orchestration & Governance                    │
│   Runner Hooks ─ Approvals ─ Policies ─ Worktree Manager     │
│   Agent Runner ─ Skill Runtime ─ Flow Runner adapters        │
└──────────────────────────┬────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────┐
│                 Execution & Observability                     │
│   Catalog (agents/skills/contracts)                           │
│   Storage (SQLite, Postgres) + MCP Providers                   │
│   Telemetry (OpenTelemetry, Langfuse)                          │
└──────────────────────────────────────────────────────────────┘
```

- Interfaces feed the orchestration layer.
- Governance enforces approvals and emits audit events.
- Catalog assets, storage backends, and MCP providers execute the work.

## Repository Layout

```
src/magsag/          → Core package code (api, runners, worktree, governance, observability)
catalog/             → Agents, skills, schemas, policies
docs/                → Architecture notes, guides, development docs
ops/                 → Maintenance scripts and tooling
benchmarks/          → Performance harnesses
tests/               → Unit, integration, observability, MCP suites
```

## Required Checks Before Any PR

```bash
uv run ruff check
uv run mypy src/magsag tests
uv run pytest -q -m "not slow"
uv run python ops/tools/check_docs.py
```

If a check is intentionally skipped, state the reason in the delivery message.

## Change Workflow

1. Create an isolated worktree: `uv run magsag wt new <run> --task <slug> --base main`.
2. Implement the change with type hints and focused tests.
3. Update documentation or catalog entries impacted by the change.
4. Record the commands you executed and their outcomes.
5. Stage changes with `git add -u` (rename-aware) and avoid unrelated drive-by edits.

## Governance Expectations

- Never commit secrets. Use environment variables or the secret manager referenced
  in `docs/policies/security.md`.
- Keep naming consistent with the `magsag` package. Do not reintroduce legacy `agdd`
  tokens or directories.
- Update `CHANGELOG.md` under `## [Unreleased]` whenever public behaviour or docs shift.
- Prefer incremental plans (`docs/development/plans/`) for multi-session work and
  close them with validation notes once delivered.

## When to Pause and Ask

- Requirements conflict with `docs/architecture/ssot.md`.
- A destructive action is requested without explicit approval (e.g., rewriting git
  history, purging data).
- External dependencies (OpenAI, Anthropic, Flow Runner) fail and no fallback
  exists.
- Governance policies or security guidelines seem ambiguous.

## Reference Surfaces

- `src/magsag/runners/agent_runner.py` – canonical executor.
- `catalog/registry/` – agent and skill registry entries.
- `docs/guides/` – integration-specific walkthroughs (MCP, moderation, GitHub).
- `docs/development/worktrees.md` – detailed worktree automation.

## Update Log

- 2025-11-01: Migrated to the unified documentation standard and refreshed metadata.
- 2025-11-01: Linked canonical ssot repository reference and clarified governance pointers.
