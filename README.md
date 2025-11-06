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
│   ├── manager/                  # Enhanced planner, auto-tune, providers
│   ├── observability/            # Metrics + summaries
│   ├── runner-*/                 # MAG/SAG runners (codex, claude, api, adk)
│   ├── mcp-client/               # MCP transport + helpers
│   ├── mcp-server/               # MCP server façade (WIP)
│   ├── schema/                   # Shared Zod schemas
│   ├── server/                   # HTTP entrypoint (experimental)
│   ├── shared-logging/           # Lightweight logger fallbacks
│   └── worktree/                 # Git worktree management
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

## Using MAGSAG as a Dependency

MAGSAG packages are published to npm under the `@magsag` scope and can be installed in external projects.

### Quick Start

Install the CLI package to get started:

```bash
# Using pnpm (recommended)
pnpm add @magsag/cli

# Using npm
npm install @magsag/cli

# Using yarn
yarn add @magsag/cli
```

### Basic Usage

```typescript
import { AgentWorkflow } from '@magsag/cli';

// Create and execute an agent workflow
const workflow = new AgentWorkflow({
  mode: 'subscription',
  mag: 'codex-cli',
  sag: 'claude-cli'
});

await workflow.plan({
  repo: '.',
  objective: 'Investigate flaky CI tests'
});
```

### Available Packages

You can install individual packages based on your needs:

```bash
# Core packages
pnpm add @magsag/core @magsag/schema @magsag/governance

# Runners (choose based on your agent framework)
pnpm add @magsag/runner-claude-agent  # For Claude Agent SDK
pnpm add @magsag/runner-codex-cli     # For Codex CLI
pnpm add @magsag/runner-openai-agents # For OpenAI Agents

# MCP integration
pnpm add @magsag/mcp-client @magsag/mcp-server

# Utilities
pnpm add @magsag/worktree @magsag/observability
```

### Engine Requirements

**Subscription Mode (Default):**
- Requires Claude CLI or Codex CLI installed and authenticated
- No API keys needed
- Works with local agent execution

**API Mode:**
- Requires API keys: `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, or `GOOGLE_API_KEY`
- Set via environment variables or configuration

### Environment Variables

```bash
# Engine configuration
ENGINE_MODE=auto|subscription|api|oss
ENGINE_MAG=codex-cli|claude-cli|openai-agents|claude-agent|adk
ENGINE_SAG=codex-cli|claude-cli|openai-agents|claude-agent|adk

# API keys (for API mode)
ANTHROPIC_API_KEY=your_anthropic_key
OPENAI_API_KEY=your_openai_key
GOOGLE_API_KEY=your_google_key

# MCP configuration
MCP_TRANSPORT=http|sse|stdio
MCP_ENDPOINT=http://localhost:3000
```

### Sample Project Setup

Create a new project using MAGSAG:

```bash
# Initialize new project
mkdir my-agent-project && cd my-agent-project
pnpm init

# Install MAGSAG
pnpm add @magsag/cli @magsag/core @magsag/schema

# Create configuration
cat > magsag.config.yaml <<EOF
mode: subscription
mag: codex-cli
sag: claude-cli
concurrency: 4
worktree:
  enabled: true
  ttl: 3600
EOF

# Run agent
pnpm exec magsag agent plan --repo . "Your objective here"
```

### TypeScript Configuration

Add these settings to your `tsconfig.json`:

```json
{
  "compilerOptions": {
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "esModuleInterop": true,
    "strict": true
  }
}
```

### Package Requirements

- **Node.js:** 18.18 or higher
- **Package Manager:** pnpm 9.x (recommended), npm 9.x, or yarn 4.x
- **Module System:** ESM (all MAGSAG packages are ESM-only)

### Troubleshooting

**Module not found errors:**
- Ensure you're using Node.js 18.18+
- Verify your `package.json` has `"type": "module"`
- Check that `moduleResolution` is set to `NodeNext` in tsconfig.json

**Workspace dependencies errors:**
- This typically happens during development
- Published packages have all dependencies resolved
- If installing from Git, build packages first: `pnpm build`

**Runner not found:**
- Ensure the CLI tool is installed (claude, codex, etc.)
- Verify authentication: `claude --version` or `codex --version`
- Check `ENGINE_MAG` and `ENGINE_SAG` environment variables

For more details, see [PUBLISHING.md](./PUBLISHING.md).

---

## Runtime Overview

- **Engine resolution**: `ENGINE_MODE` (`auto|subscription|api|oss`) controls subscription vs API engines. `ENGINE_MAG` / `ENGINE_SAG` choose runners (`codex-cli`, `claude-cli`, `openai-agents`, `claude-agent`, `adk`). Defaults resolve to `codex-cli` (MAG) + `claude-cli` (SAG).
- **CLI**: `pnpm --filter @magsag/cli exec magsag agent plan --repo . "Investigate flaky CI"` generates a JSON plan. Execute it via `agent exec` with concurrency and provider controls, e.g. `pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json --concurrency 4 --provider-map "claude-cli:2,codex-cli"`. Runs stream subtask state and write JSONL logs to `.magsag/runs/<id>.jsonl`, which you can replay with `magsag runs describe <id>`.
  Override engine defaults with `--mode`, `--mag`, `--sag`, or pass `--worktree-root` / `--base` when provisioning SAG worktrees.
  New worktree commands: `magsag worktrees:ls` lists active worktrees, `magsag worktrees:gc` performs garbage collection.
- **Flow governance**: `@magsag/governance` evaluates flow summaries against YAML policies. Flow Runner tooling is being ported to TypeScript; interim manual review notes must be logged in the ExecPlan.
- **MCP**: `@magsag/mcp-client` exposes HTTP/SSE/stdio transports. Server scaffolding continues under Workstream A; record schema or contract changes in `docs/development/plans/repo-cleanup-execplan.md`.

---

## Enhanced Features

### Parallel Execution Framework

The manager package provides advanced parallel execution capabilities:

- **HeuristicPlanner**: Intelligent task planning with dependency analysis and exclusiveKeys support for file-level locking
- **AutoTune**: Dynamic adjustment of parallel execution based on failure rates and system metrics
- **Provider Interfaces**: Pluggable providers for workspace graph, TypeScript diagnostics, metrics, and repository information
- **WorktreeManager**: Manages Git worktrees with JSON-based state persistence and automatic cleanup

Example usage:
```bash
# List active worktrees
pnpm --filter @magsag/cli exec magsag worktrees:ls

# Garbage collect expired worktrees
pnpm --filter @magsag/cli exec magsag worktrees:gc --ttl 3600
```

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
| `@magsag/cli` | oclif CLI exposing `agent`, flow governance, and worktree utilities |
| `@magsag/core` | Engine contracts, runner interfaces, selection helpers |
| `@magsag/schema` | Zod schemas (`RunSpec`, `RunnerEvent`, policy definitions) |
| `@magsag/governance` | Flow gate evaluation + policy parsing |
| `@magsag/manager` | Enhanced parallel execution planner with auto-tune and provider interfaces |
| `@magsag/worktree` | Git worktree management with JSON store and lifecycle tracking |
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
