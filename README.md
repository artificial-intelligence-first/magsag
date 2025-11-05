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
├── tools/                        # Tooling (MCP sources, scripts)
├── examples/                     # Reference flows and snippets
├── eslint.config.js              # Flat ESLint config shared across packages
├── tsconfig.json                 # Base TS config with path aliases
├── vitest.config.ts              # Root test configuration
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
- **CLI**: `pnpm --filter @magsag/cli exec magsag agent plan --repo . "Investigate flaky CI"` generates a JSON plan. Execute it via `agent exec` with concurrency and provider controls, e.g. `pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json --concurrency 4 --provider-map "claude-cli:2,codex-cli"`. Runs stream subtask state and write JSONL logs to `.magsag/runs/<id>.jsonl`, which you can replay with `magsag runs describe <id>`.
  Override engine defaults with `--mode`, `--mag`, `--sag`, or pass `--worktree-root` / `--base` when provisioning SAG worktrees.
- **Flow governance**: `@magsag/governance` evaluates flow summaries against YAML policies. Flow Runner tooling is being ported to TypeScript; interim manual review notes must be logged in the ExecPlan.
- **MCP**: `@magsag/mcp-client` exposes HTTP/SSE/stdio transports. Server scaffolding continues under Workstream A; record schema or contract changes in `docs/development/plans/repo-cleanup-execplan.md`.

---

## Demo Surfaces

- `pnpm --filter @magsag/demo-cli build && pnpm --filter @magsag/demo-cli start mcp` lists MCP presets sourced from `tools/adk/servers/` and highlights transport coverage.
- `pnpm --filter @magsag/demo-cli start plan` summarises the active repository cleanup ExecPlan for quick status checks.
- `pnpm --filter @magsag/demo-api build && pnpm --filter @magsag/demo-api start` starts a lightweight HTTP server exposing `/health`, `/mcp`, and `/plan` endpoints mirroring the same summaries.

---

## Quality Gates

```bash
pnpm -r lint
pnpm -r typecheck
pnpm -r test
pnpm docs:lint
pnpm catalog:validate
```

- Documentation and catalog validation now run via `pnpm docs:lint` and `pnpm catalog:validate`; record outcomes alongside the other gates.
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
   pnpm docs:lint
   pnpm catalog:validate
   ```
   Note any skipped gates (including docs/catalog) in the delivery log.
3. Draft release artifacts (CLI help, notable breaking changes) and share with Workstream E for docs alignment.
4. Tag (dry-run): `git tag -a v2.0.x <sha>` → confirm → `git tag -d v2.0.x` until ready for push.

---

## Contributing & Workstreams

- The TypeScript cleanup and migration follow-ups are coordinated in `docs/development/plans/repo-cleanup-execplan.md`.
- Create dedicated git worktrees manually (e.g. `git worktree add ../wt-cleanup feature/repo-cleanup`) and capture the command in hand-off notes—the legacy `magsag wt` command no longer exists.
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
| `@magsag/demo-shared` | Shared helpers for demo CLI/API (MCP presets, ExecPlan summaries) |

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
