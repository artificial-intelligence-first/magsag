# MAGSAG Framework

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Node Version](https://img.shields.io/badge/node-18.18%2B-%23026e00)](https://nodejs.org/en)
[![CI Status](https://img.shields.io/github/actions/workflow/status/artificial-intelligence-first/magsag/ci.yml?branch=main&label=CI)](https://github.com/artificial-intelligence-first/magsag/actions/workflows/ci.yml?branch=main)

MAGSAG is a governance-first framework for building and operating AI agent workflows.  
Version 2.0 is a TypeScript-only monorepo that ships a subscription-first MAG/SAG runtime, optional API engines, governance gates, and documentation assets under a pnpm/turborepo toolchain.

---

## Monorepo Topology

```
.
├── packages/                     # TypeScript packages (ESM)
│   ├── cli/                      # oclif-based CLI (`magsag`)
│   ├── core/                     # Engine contracts, selection helpers
│   ├── governance/               # Flow gates, policy evaluation
│   ├── observability/            # Metrics + summaries
│   ├── runner-*/                 # MAG/SAG runners (codex, claude, api, adk)
│   ├── mcp-client/               # MCP transport + helpers
│   ├── mcp-server/               # MCP server façade (WIP)
│   ├── schema/                   # Shared Zod schemas
│   ├── server/                   # HTTP entrypoint (experimental)
│   └── shared-logging/           # Lightweight logger fallbacks
├── apps/                         # Demo surfaces (CLI/API shells)
├── catalog/                      # Agents, skills, policies, contracts
├── docs/                         # Architecture notes, plans, governance guides
├── ops/                          # Tooling (MCP sources, scripts)
├── examples/                     # Reference flows and snippets
├── eslint.config.js              # Flat ESLint config shared across packages
├── tsconfig.base.json            # Base TS config with path aliases
├── turbo.json                    # turborepo pipeline definitions
├── package.json                  # Root metadata + devDependencies
└── pnpm-workspace.yaml           # Workspace definition
```

---

## Prerequisites

- Node.js **18.18+** (22.x LTS recommended for local development)
- pnpm **9.x**
- Codex CLI / Claude CLI installed and authenticated for subscription mode
- Optional API engines: OpenAI Agents, Claude Agent SDK, Google ADK (requires credentials)

---

## Setup & Bootstrap

```bash
# install dependencies for every package
pnpm install

# optional: build distributable artefacts (tsup)
pnpm -r build

# explore CLI commands (subscription mode is default)
pnpm --filter @magsag/cli exec magsag --help
```

Each package defines standard scripts (`lint`, `typecheck`, `test`, `build`). Use `pnpm --filter <pkg> <script>` for targeted work or `pnpm -r <script>` for the entire workspace.

---

## Runtime Overview

- **Engine resolution**: `ENGINE_MODE` (`auto|subscription|api|oss`) controls subscription vs API engines. `ENGINE_MAG` / `ENGINE_SAG` choose runners (`codex-cli`, `claude-cli`, `openai-agents`, `claude-agent`, `adk`). Defaults resolve to `codex-cli` (MAG) + `claude-cli` (SAG).
- **CLI**: `pnpm --filter @magsag/cli exec magsag agent run --repo . "Investigate flaky CI"`  
  Use `--mode`, `--mag`, `--sag`, and `--resume` to override defaults.
- **Flow governance**: `@magsag/governance` evaluates flow summaries against YAML policies. Flow Runner tooling is being ported to TypeScript; interim manual review notes must be logged in the ExecPlan.
- **MCP**: `@magsag/mcp-client` exposes HTTP/SSE/stdio transports. Server scaffolding continues under Workstream A; record schema or contract changes in `docs/development/plans/typescript-full-migration.md`.

---

## Quality Gates

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
```

- Documentation & policy validation is **manual until the TypeScript tooling ships**. Review edited Markdown against `docs/governance/frontmatter.md`, confirm catalog schemas, and record the outcome in the ExecPlan (Surprises & Discoveries) while notifying Workstream E.
- When touching a single package, prefer scoped checks: `pnpm --filter @magsag/<pkg> lint|typecheck|test`.
- Capture all command results (including manual checks) in delivery notes or PR descriptions.

---

## Release Workflow (2.0.x)

1. Update `CHANGELOG.md` (`## [Unreleased]`) and move entries under a dated `## [2.0.x]` section when shipping.  
   Reference the governance updates, CLI surface, and deprecation of Python assets.
2. Run validation:
   ```bash
   pnpm -r lint
   pnpm -r typecheck
   pnpm -r test
   ```
   Note doc/policy verification as manual.
3. Draft release artifacts (CLI help, notable breaking changes) and share with Workstream E for docs alignment.
4. Tag (dry-run): `git tag -a v2.0.x <sha>` → confirm → `git tag -d v2.0.x` until ready for push.

---

## Contributing & Workstreams

- The TypeScript migration is coordinated in `docs/development/plans/typescript-full-migration.md` and the workstream tracker (`docs/development/plans/typescript-full-migration-workstreams.md`).
- Create dedicated git worktrees manually (e.g. `git worktree add ../wt-ts-migration-f typescript-full-migration`) and capture the command in hand-off notes—the legacy `magsag wt` command no longer exists.
- Follow `AGENTS.md` for day-to-day expectations (pnpm workflow, validation gates, delivery notes).
- Report surprises, missing tooling, or manual steps in the ExecPlan and alert the owning workstream.

---

## Packages at a Glance

| Package | Summary |
| --- | --- |
| `@magsag/cli` | oclif CLI exposing `agent`, flow governance, and upcoming worktree utilities |
| `@magsag/core` | Engine contracts, runner interfaces, selection helpers |
| `@magsag/schema` | Zod schemas (`RunSpec`, `RunnerEvent`, policy definitions) |
| `@magsag/governance` | Flow gate evaluation + policy parsing |
| `@magsag/observability` | Flow summaries, metrics orchestration |
| `@magsag/runner-*` | MAG/SAG runners: Codex CLI, Claude CLI, OpenAI Agents, Claude Agent, ADK |
| `@magsag/mcp-client` | MCP transport, circuit breaker, tests |
| `@magsag/mcp-server` | MCP exposure of catalog + governance (under construction) |
| `@magsag/shared-logging` | Minimal logger with console fallback |

---

## Documentation

- `AGENTS.md` – Operational expectations for humans & AI assistants
- `SSOT.md` – Canonical documentation map
- `docs/development/plans/` – ExecPlan, workstream board, migration threads
- `docs/governance/` – Frontmatter schema, style guide, taxonomy
- `catalog/` – Reference agents, skills, policies, templates

Update all living documents with frontmatter metadata and append to their update logs. Override instructions only with explicit approval.

---

## License

MAGSAG is released under the [MIT License](./LICENSE).
