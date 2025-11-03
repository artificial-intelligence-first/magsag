---
title: SDK & ADK Unified Runtime Migration
slug: sdk-adk-runtime-migration
status: active
last_updated: 2025-11-05
last_synced: '2025-11-05'
tags:
- plans
- sdks
- adk
- mcp
- governance
summary: Complete the transition to the new SDK/ADK stack by removing legacy paths, standardising MCP artefacts, and refreshing tooling, docs, and tests.
description: Tracks all follow-up work required after the SDK unification rollout, including MCP JSON standardisation, CLI/API updates, governance hooks, automation, documentation, and test coverage so the repository reflects only the new SDK/ADK workflows.
authors: []
sources: []
---

# SDK & ADK Unified Runtime Migration

## Purpose / Big Picture
- Ensure the repository exposes only the new SDK/ADK-compatible workflows, artefacts, and documentation while eliminating legacy paths and technical debt.

## To-do
- [ ] Catalogue every surface touched by SDK/ADK rollout (CLI, API, governance, docs, automation, MCP artefacts, tests, templates).
- [ ] Remove or migrate legacy logic, configs, and docs that reference pre-unification workflows.
- [ ] Standardise `.mcp/servers/` と `catalog/tools/` を JSON 生成物のみにし、編集用 YAML を `ops/adk/` 系へ集約。
- [ ] Refresh CLI/API help、OpenAPI スキーマ、サンプル to align with ExternalHandoffTool/BudgetController.
- [ ] Update docs (SSOT, AGENTS, architecture, workflows, changelog) to describe new SDK/ADK runtime and removal of old flows.
- [ ] Extend automation (CI, scripts) with MCP sync / handoff smoke tests and artefact regeneration checks.
- [ ] Expand regression coverage (unit/integration) for Codex/Claude handoffs、BudgetController、traceparent flows、MCP sync pipeline.
- [ ] Verify relative paths, imports, and packaging after relocation of assets.
- [ ] Capture remaining risks / follow-up and close the plan with validation evidence.

## Progress
- 2025-11-05T00:00:00Z — Plan drafted; inventory phase pending.

## Decision Log
- 2025-11-05T00:00:00Z — Runtime artefacts will be JSON-only; human-authored sources move under `ops/adk/`.
- 2025-11-05T00:00:00Z — CLI/API/docs/test updates will ship atomically with artefact consolidation to avoid drift.

## Surprises & Discoveries
- None yet.

## Outcomes & Retrospective
- Pending.

## Context and Orientation
- `docs/architecture/agents.md`, `SSOT.md`, `CHANGELOG.md` currently mention the rollout but still describe legacy flows in places.
- `.mcp/servers/` と `catalog/tools/` mix YAML presets with ADK-generated JSON.
- CLI (`magsag agent handoff`, `magsag mcp sync`) and API (`POST /api/v1/agents/handoff`) help text still contains legacy references.
- CI workflow lacks enforced regeneration / validation of new artefacts.

## Plan of Work
1. **Inventory & Gap Analysis**
   - Enumerate affected files and flag legacy references.
   - Document asset ownership (source YAML vs generated JSON).
2. **Artefact Restructuring**
   - Relocate editable YAML sources to `ops/adk/`.
   - Ensure `.mcp/servers/` と `catalog/tools/` deliver only generated JSON.
   - Update sync tooling to regenerate deterministically (timestamps, sorting).
3. **Runtime & Governance Updates**
   - Refresh CLI/API options, docs, and error messaging reflecting BudgetController/ApprovalGate/external targets.
   - Update governance docs & SSOT with new configuration surfaces (env vars, budgets, approvals).
4. **Documentation Sweep**
   - Synchronise AGENTS, architecture guides, workflow docs, templates, changelog.
   - Remove or rewrite legacy instructions, screenshots, or command snippets.
5. **Automation & Testing**
   - Extend CI/scripts with `magsag mcp sync` regeneration checks and handoff smoke tests.
   - Add/Update unit・integration tests for new paths (Codex/Claude drivers, BudgetController, trace propagation).
6. **Validation & Closure**
   - Run full validation suite and targeted manual checks.
   - Record outcomes and residual risks; close plan.

## Concrete Steps
1. [ ] Inventory & log all files needing updates (spreadsheet or plan appendix).
2. [ ] Implement artefact restructuring and sync tooling updates.
3. [ ] Update CLI/API help text, OpenAPI schema, and examples.
4. [ ] Refresh governance + documentation suites (SSOT, AGENTS, architecture, workflows).
5. [ ] Update automation scripts / CI jobs and add regression tests.
6. [ ] Execute validation commands, capture evidence, and finalise plan notes.

## Validation and Acceptance
- `uv run ruff check .`
- `uv run mypy src tests`
- `uv run pytest -q -m "not slow"`
- `uv run python ops/tools/check_docs.py`
- `uv run magsag mcp sync`（確認用 `--dry-run` も含む）
- Targeted handoff tests: `uv run pytest tests/unit/test_external_handoff_tool.py tests/runner/test_agent_runner_external.py`
- Manual verification: CLI help text (`magsag --help`), API schema (`uv run magsag api schema` 等), docs preview.
- Confirm no YAML artefacts remain under `.mcp/servers/` / `catalog/tools/`.

## Idempotence and Recovery
- Sync tooling should be idempotent; re-run `uv run magsag mcp sync` after cleaning generated directories.
- Keep pre-migration branch/tag to recover legacy layout if rollback is needed.
- Document required environment variables (budgets, approvals) before promoting configuration changes.
