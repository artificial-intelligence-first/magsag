---
title: MCP Code Execution Migration ExecPlan
slug: mcp-code-execution-migration
status: stable
last_updated: 2025-11-06
last_synced: '2025-11-06'
tags:
- plans
- development
- mcp
summary: Replace direct MCP tool calls with code execution surfaces that minimize token usage.
description: Plan to transform the MAGSAG runtime to the MCP code execution architecture described by Anthropic, covering scaffolding, security, tooling, and rollout.
authors: []
sources:
- id: R1
  title: Code execution with MCP: Building more efficient agents
  url: https://www.anthropic.com/engineering/code-execution-with-mcp
  accessed: '2025-11-05'
- id: R2
  title: MAGSAG Agent Playbook
  url: ../../AGENTS.md
  accessed: '2025-11-05'
---

# MCP Code Execution Migration Plan

## Purpose
- Adopt the MCP code execution architecture end-to-end so tool definitions and large result sets no longer flood model context windows.
- Enforce data filtering and security guardrails inside the execution environment to minimize sensitive information exposed to the model.
- Build reusable skill assets and persistent workspaces so long-lived automations can resume work and share higher-level capabilities.

## Context
- Current skills call `McpRuntime.executeTool` directly and stream full tool descriptions or results back through the model (for example `packages/catalog/src/skills/notion-page-lookup.ts:29`).
- `McpClient.listTools` eagerly loads every tool definition, creating scaling risks when hundreds of MCP servers are connected.
- The runtime lacks a standardized way to persist code or artifacts inside execution workspaces, limiting resumability and reuse.
- Privacy protections are limited to manual guards; there is no default tokenization or masking layer before logging to the model.

## Objectives
1. Generate TypeScript modules for each MCP server so models import only the APIs they need instead of loading raw tool definitions.
2. Standardize execution workspaces within the runners and CLI so control flow, filtering, and data joins happen in code rather than via chained tool calls.
3. Introduce default tokenization and filtering for PII and other sensitive payloads, ensuring models see masked placeholders by default.
4. Persist intermediate outputs and reusable skill code on the filesystem with metadata aligned to the catalog’s SKILL format.
5. Migrate existing skills, runners, documentation, and validation suites to the new architecture and retire the legacy direct-call pathway.

## Status
- **Completed 2025-11-06** — Workstreams A–E delivered; runners now use execution sandboxes, skills consume generated MCP wrappers, PII middleware active, SKILL docs generated, and benchmarks recorded.

## Success Criteria
- All skills access MCP servers through generated modules; no code calls `executeTool` directly.
- CLI benchmarks show at least a 20% reduction in model token usage when executing large tool catalogs or 10,000+ row datasets.
- Logs surfaced to the model contain only tokenized placeholders; unmasked PII never appears in model-visible events.
- Architecture and workflow documentation (for example `docs/architecture/agents.md`) reflect the new pattern and pass `pnpm docs:lint`.

## Workstreams and Tasks

### A. Execution Environment and Sandbox Hardening
1. Extend `@magsag/runner-*` packages to provision code-execution workspaces with configurable CPU, memory, and wall-clock limits.
2. Implement lifecycle management for workspace artifacts (quota enforcement, retention policies, cleanup tooling).
3. Add structured channels for code output and logs so the model only receives curated excerpts from the workspace.

### B. MCP Tool Code Generation Pipeline
1. Build a TypeScript CLI (`pnpm mcp:codegen`) that reads `tools/adk/servers/*.yaml` and generates `servers/<server>/<tool>.ts` modules.
2. Provide a shared `callMCPTool` helper that injects typed interfaces, documentation comments, and error handling into generated modules.
3. Add snapshot and type tests to keep generated modules stable (`pnpm --filter @magsag/mcp-client test` plus dedicated generator checks).

### C. Runtime and Skill Refactors
1. Rewrite `packages/catalog/src/skills/*` to import generated modules and perform business logic inside the execution environment.
2. Add CLI affordances such as `search_tools` integration and filesystem browsing so models request detailed definitions only when needed.
3. Enhance `McpClient` and CLI layers with lazy-loading and caching controls to prevent unnecessary tool metadata fetches.

### D. Data Protection and Logging
1. Implement a middleware layer that detects and tokenizes PII before results or logs leave the execution workspace.
2. Introduce explicit data flow policies in the MCP client, restricting which servers can exchange raw payloads.
3. Define secure storage for unmasked audit logs and document access controls for human operators.

### E. Skill Persistence and Documentation
1. Generate `skills/<name>/SKILL.md` templates alongside code so reusable functions ship with structured metadata.
2. Update `docs/architecture/agents.md`, `docs/development/workflows/`, and `SSOT.md` to make the code execution pattern canonical.
3. Revise `CHANGELOG.md` and delivery note templates to capture migration milestones and validation evidence.

## Milestones
1. Merge the code generation CLI and sandbox API prototype.
2. Complete module generation and skill migration for high-traffic servers (e.g., notion, salesforce, supabase).
3. Demonstrate privacy middleware in CLI output with masked PII and configurable policies.
4. Finish migrating all skills and remove the legacy direct `executeTool` pathway.
5. Publish migration benchmarks and updated runbooks documenting the new architecture.

## Validation
- `pnpm -r lint`
- `pnpm -r typecheck`
- `pnpm -r test`
- `pnpm docs:lint`
- `pnpm catalog:validate`
- `pnpm mcp:codegen --check`
- `pnpm bench:mcp`
- Benchmark suite comparing legacy vs. new architectures for token usage, latency, and resource consumption.

## Benchmark Results (2025-11-06)
- `pnpm bench:mcp` shows aggregate token usage dropping from 5,929 legacy tokens to 843 sandbox tokens (85.78% reduction).
- Per-skill reductions:
  - `skill.doc-gen`: 822 → 153 tokens (81.39% reduction)
  - `skill.salary-band-lookup`: 822 → 185 tokens (77.49% reduction)
  - `skill.github-issue-triage`: 1,074 → 133 tokens (87.62% reduction)
  - `skill.notion-page-lookup`: 938 → 135 tokens (85.61% reduction)
  - `skill.supabase-sql-readonly`: 1,162 → 112 tokens (90.36% reduction)
  - `skill.obsidian-note-append`: 1,111 → 125 tokens (88.75% reduction)

## Risks and Mitigations
- **Sandbox complexity**: Roll out resource limits incrementally and keep the initial implementation minimal to avoid blocking adoption.
- **Generated code drift**: Centralize templates and add `pnpm mcp:codegen --check` to CI so builds fail when generated code is stale.
- **PII detection accuracy**: Start with rule-based detection plus manual overrides; iterate with telemetry from audit logs.
- **Migration overlap**: Maintain a thin compatibility layer during rollout to avoid double-maintaining skill logic.

## Update Log
- 2025-11-06: Completed Workstreams A–E (sandbox, codegen, skill refactors, PII middleware, docs/benchmarks), recorded 85.78% aggregate token reduction, and updated validation commands.
- 2025-11-05: Initial draft outlining full migration scope and workstreams for the MCP code execution architecture.
