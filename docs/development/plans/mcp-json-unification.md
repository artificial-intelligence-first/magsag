---
title: MCP Preset JSON Unification
slug: mcp-json-unification
status: active
last_updated: 2025-11-05
last_synced: '2025-11-05'
tags:
- plans
- mcp
- automation
summary: Standardise MCP preset artefacts on generated JSON while relocating editable YAML sources.
description: Consolidate MCP preset management by relocating human-authored YAML sources to ops/adk, regenerating JSON artefacts, updating docs/tooling, and validating downstream AI workflows.
authors: []
sources: []
---

# MCP Preset JSON Unification

## Purpose / Big Picture
- Deliver a consistent MCP preset layout where downstream consumers rely exclusively on generated JSON artefacts.

## To-do
- [ ] Inventory existing `.mcp/servers` and `catalog/tools` content, classify source vs generated assets.
- [ ] Relocate editable YAML presets to a canonical source directory and update sync tooling.
- [ ] Regenerate JSON artefacts and ensure repository only surfaces generated files for runtime consumption.
- [ ] Update documentation, CLIs, and tests to reflect the new workflow.
- [ ] Validate AI workflows end-to-end with the unified preset layout.

## Progress
- 2025-11-05T00:00:00Z — Plan drafted; awaiting execution kick-off.

## Decision Log
- 2025-11-05T00:00:00Z — Chose JSON-only runtime artefacts with YAML confined to ops/adk sources.

## Surprises & Discoveries
- None yet.

## Outcomes & Retrospective
- Pending.

## Context and Orientation
- `.mcp/servers/` currently mixes YAML presets with new JSON artefacts.
- `ops/adk/catalog.yaml` houses ADK-driven definitions and will become the canonical source for future providers.
- MCP workflow docs reside in `docs/architecture/agents.md` and `docs/workflows/`.

## Plan of Work
1. Audit current MCP assets and identify ownership (source vs generated).
2. Update sync tooling to read from source YAML directory and emit JSON artefacts deterministically.
3. Adjust documentation and CLI help text to describe the new workflow.
4. Run validation (lint, type-check, tests, `magsag mcp sync`, targeted agent delegations).
5. Capture results, close plan, and archive legacy assets.

## Concrete Steps
1. [ ] Catalogue existing MCP preset files and document ownership decisions.
2. [ ] Implement tooling and repo layout changes for JSON-only runtime assets.
3. [ ] Update docs/CLI/tests to reflect the new process.
4. [ ] Execute validation suite and record outcomes.
5. [ ] Finalise plan closure notes and clean up stragglers.

## Validation and Acceptance
- `uv run ruff check .`
- `uv run mypy src tests`
- `uv run pytest -q -m "not slow"`
- `uv run python ops/tools/check_docs.py`
- `uv run magsag mcp sync`
- Targeted MCP smoke tests (CLI + API flows that rely on preset discovery).

## Idempotence and Recovery
- Run `git clean -fdX` on `.mcp/servers/` and `catalog/tools/` before regenerating artefacts.
- Use `uv run magsag mcp sync --dry-run` to verify planned outputs without writes.
- Maintain backups of relocated YAML source files via git history; restore by checking out the previous commit if needed.
