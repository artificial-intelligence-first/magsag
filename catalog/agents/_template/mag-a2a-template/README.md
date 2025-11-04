# MAG A2A Template (TypeScript Migration)

Python examples for agent-to-agent orchestration have been removed. Build coordinators with the TypeScript packages instead:

- Author coordination logic in a TypeScript module and export it for catalog consumption (`@magsag/catalog#agents.yourA2aOrchestratorMag`).
- Document dependencies and validation steps in delivery notes.
- Execute the shared validation commands (`pnpm -r lint`, `pnpm -r typecheck`, `pnpm -r test`, `pnpm docs:lint`, `pnpm catalog:validate`).

Legacy pytest instructions have been retired.
