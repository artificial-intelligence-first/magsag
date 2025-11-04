---
slug: skill-template-mcp
status: deprecated
last_updated: 2025-11-06
summary: Placeholder skill template while MCP examples migrate to TypeScript.
---

# MCP Skill Template (TypeScript Migration)

The Python implementation (`impl/mcp_tool.py`) and pytest fixtures were removed. Use the TypeScript catalog package instead:

- Implement MCP logic within `packages/catalog/src/skills`.
- Export your skill and reference it via `@magsag/catalog#skills.<Name>`.
- Document behaviour in `SKILL.md` and validate with `pnpm docs:lint` + `pnpm catalog:validate`.

Legacy references remain available in Git history prior to branch `feature/ts-migration/f-legacy-cleanup`.
