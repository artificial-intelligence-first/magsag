# SAG Template (TypeScript Migration)

The legacy Python SAG template has been archived. Use the TypeScript workflow instead:

- Implement SAG logic in a TypeScript module (for example within `packages/catalog/src/agents`).
- Reference the entrypoint via `@magsag/catalog#agents.yourAdvisorSag`.
- Follow the validation commands listed in `docs/guides/agent-development.md`.

Historical pytest commands are no longer applicable.
