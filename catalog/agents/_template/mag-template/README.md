# MAG Template (TypeScript Migration)

The Python-based template for MAG orchestration was removed during the TypeScript migration.

- Implement MAG logic inside a TypeScript package (recommendation: `packages/catalog`).
- Reference the implementation via `@magsag/catalog#agents.yourOrchestratorMag` in catalog YAML.
- Use the validation checklist from `docs/guides/agent-development.md`.

Legacy pytest commands and `.py` entrypoints are intentionally omitted.
