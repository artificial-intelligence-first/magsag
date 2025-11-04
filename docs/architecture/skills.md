---
title: Skill Development Cheatsheet
slug: architecture-skills
> **Notice**: Legacy Python-based skill guidance; update pending TypeScript catalog tooling.
status: deprecated
last_updated: 2025-11-02
tags:
- skills
- workflow
summary: Checklist for defining, implementing, and shipping skills within the MAGSAG
  catalog.
authors: []
sources:
- id: R1
  title: Catalog Skill Templates
  url: ../../catalog/skills/_template/SKILL.md
  accessed: '2025-11-01'
last_synced: '2025-11-02'
description: Checklist for defining, implementing, and shipping skills within the
  MAGSAG catalog.
---

# Skill Development Cheatsheet

> **For Humans**: Use this guide to deliver skills that match catalog and runtime expectations with minimal rework.
>
> **For AI Agents**: Enforce these steps when editing skill code or metadata; escalate if requirements conflict.

## Overview

This cheatsheet keeps skill development consistent without forcing you to read pages of prose. Link out to detailed guides when further context is needed.

## Where Things Live

- Registry: `catalog/registry/skills.yaml`
- Implementation: `catalog/skills/<slug>/code/`
- Optional docs/resources: `catalog/skills/<slug>/SKILL.md`, `templates/`, `schemas/`

## Definition Checklist

1. Choose a canonical `id` (`skill.<slug>`) and append semantic versions.
2. Point `entrypoint` to the callable (`catalog/skills/.../code/main.py:run`).
3. Declare permissions; use the narrowest scope (e.g., `[]`, `["mcp:filesystem.read"]`).
4. Provide a short description or tags if discoverability matters.

## Implementation Notes

- Preferred signature:
  ```python
  async def run(payload: dict[str, Any], *, mcp: MCPRuntime | None = None) -> dict[str, Any]:
      ...
  ```
- Validate inputs explicitly (JSON Schema or manual guards).
- Handle `mcp is None` gracefully; log a warning and return a deterministic fallback.
- Keep functions pure and avoid global state. Read configuration from payload or
  `MAGSAG_` environment variables that are documented elsewhere.

## Testing

```bash
pnpm --filter @magsag/cli testskills/test_<skill>.py
pnpm --filter @magsag/cli testmcp/test_skill_mcp_integration.py   # when MCP involved
uv run mypy catalog/skills/<slug>/code
```

Cover:
- Success and failure paths.
- MCP-enabled and MCP-disabled scenarios.
- Contract compliance (return type matches calling agent expectations).

## Documentation & Release

- Update per-skill `SKILL.md` with purpose, inputs, outputs, and fallbacks.
- Cross-link new terminology in `docs/architecture/ssot.md` when needed.
- Add changelog entries for behaviour changes.
- Bump the registry version when modifying inputs, outputs, or side effects.

## References

- `docs/guides/mcp-integration.md` – full MCP server/client walkthrough.
- `catalog/skills/salary-band-lookup/` – async skill with MCP integration.
- `tests/mcp/` – integration tests demonstrating mocked transports.

## Update Log

- 2025-11-02: Refreshed metadata and aligned tags with the documentation taxonomy.
- 2025-11-01: Converted to the unified documentation format and refreshed references.

Keep this cheatsheet lean. If you find yourself adding long explanations, move them into the relevant guide and link back instead.
