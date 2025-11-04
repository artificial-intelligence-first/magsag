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
│   ├── mcp-server/               # MCP server runtime (HTTP + SSE/WebSocket bridge)
│   ├── schema/                   # Shared Zod schemas
│   ├── server/                   # HTTP entrypoint (MAG/SAG SSE + WebSocket API)
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

## Sandbox Exec (codex-universal)

All sandboxed execution runs inside `ghcr.io/openai/codex-universal:latest`. The
Docker container is forced to `--platform=linux/amd64` for Apple Silicon parity,
and sets `CODEX_ENV_NODE_VERSION=20` to match the published Node runtimes. Refer
to the codex-universal README and the GHCR package page for release cadence and
supported runtimes.[^codex-universal]

```bash
npm run exec
```

Expected output:

```
[preflight] policy OK: container ghcr.io/openai/codex-universal:latest
[CTR] policy: container ghcr.io/openai/codex-universal:latest
[CTR] hello from sandbox-runner.
```

- The host workspace is mounted read-only; `.work/` is the only writeable path.
- Network access is disabled by default (`network: none` in
  `policy/default.policy.yaml`). Open selective domains through a reviewable PR.
- Docker hardening flags (`--read-only`, `--cap-drop=ALL`,
  `--cap-add=SETUID`, `--cap-add=SETGID`, `--security-opt
  no-new-privileges`, resource limits) must remain in place.
- `scripts/sandbox-entry.sh` resolves the container Node runtime dynamically,
  rewrites `/work/tmp/node`, then invokes it with `setpriv --no-new-privs`
  as UID/GID 65532 so user code never runs as root.
- HOME/TMPDIR resolve to `.work/` so temp files stay inside the sandboxed
  volume; the host bootstrap (`npm run exec`) pre-creates the directory with
  permissive permissions for the sandbox user.
- `npm run preflight` validates the sandbox policy (image pin, network mode,
  resource limits, forbidden functions) before the container launches.
- Use VS Code / Cursor `F5` (launch configuration `Sandbox Exec`) to trigger the
  same sand-boxed execution loop.

Troubleshooting:

- Ensure Docker Desktop shares the repository path (`Settings ➜ Resources ➜
  File Sharing`).
- Re-run `npm run build` if `dist/` assets are missing; the postbuild step
  injects `dist/package.json` with `{ "type": "module" }`.
- When updating the policy, prefer keeping `network.mode: none` and documenting
  any exceptions in the PR.

[^codex-universal]: See the [codex-universal README](https://github.com/openai/codex-universal)
and the [GHCR package page](https://github.com/openai/codex-universal/pkgs/container/codex-universal)
for image details and environment variables such as `CODEX_ENV_NODE_VERSION`.

---

## Runtime Overview

- **Engine resolution**: `ENGINE_MODE` (`auto|subscription|api|oss`) controls subscription vs API engines. `ENGINE_MAG` / `ENGINE_SAG` choose runners (`codex-cli`, `claude-cli`, `openai-agents`, `claude-agent`, `adk`). Defaults resolve to `codex-cli` (MAG) + `claude-cli` (SAG).
- **CLI**: `pnpm --filter @magsag/cli exec magsag agent run --repo . "Investigate flaky CI"`  
  Use `--mode`, `--mag`, `--sag`, and `--resume` to override defaults.
- **Flow governance**: `@magsag/governance` enforces YAML policies against `@magsag/observability` flow summaries. Keep policy defaults in sync with `docs/development/plans/typescript-full-migration.md`.
- **Server**: `@magsag/server` exposes `/api/v1/agent/run` over SSE and WebSocket, dispatching runners from the shared registry and emitting MCP metadata.
- **MCP**: `@magsag/mcp-client` exposes HTTP/SSE/stdio transports and retries; `@magsag/mcp-server` powers the TypeScript runtime with HTTP ⇄ SSE ⇄ stdio fallback; `@magsag/catalog-mcp` ships catalog tool definitions consumed by the CLI/runner integration (`magsag mcp ls|doctor`).

---

## Quality Gates

```bash
pnpm ci:lint          # pnpm -r lint
pnpm ci:typecheck     # pnpm -r typecheck
pnpm ci:build         # pnpm -r build (tsup bundles for every package)
pnpm ci:test          # vitest --run (unit + integration + CLI suites)
pnpm ci:e2e           # vitest --run --project e2e (CLI ↔ runner ↔ server)
pnpm ci:size          # node ops/scripts/check_package_size.mjs
pnpm --filter docs lint || uv run python ops/tools/check_docs.py
```

- Prefer `pnpm --filter @magsag/<pkg> <script>` for targeted work; the shared scripts fan out across the workspace.
- Document any skipped gate (and the reason) in delivery notes or the PR body.
- Bundle-size budgets cover CLI, core, server, governance, observability, and MCP packages—update thresholds alongside intentional growth.
- Record doc lint results and taxonomy alignment when editing Markdown or catalog assets.

---

## Sandbox Execution

- `npm run preflight` verifies that sandbox policies stay intact (container image, network isolation, resource limits, privilege dropping). The script inspects `package.json` and `scripts/sandbox-entry.sh`; it fails fast if required flags are missing.
- `npm run exec` compiles sources, runs the preflight, and launches the containerised runner via `npm run exec:ctr`. The Docker invocation pins the `ghcr.io/openai/codex-universal:latest` image, drops privileges to UID/GID 65532, disables networking, and mounts the repo read-only.
- `scripts/sandbox-entry.sh` performs the final privilege drop inside the container using `setpriv --no-new-privs`. Do not bypass this shim—changes must continue to enforce the 65532 sandbox user.
- CI mirrors these checks in `.github/workflows/sandbox-check.yml`; keep the workflow green whenever sandbox policies evolve.

---

## Continuous Integration

- `.github/workflows/ts-ci.yml` runs a workspace pass plus a package matrix for `cli`, `core`, `server`, `mcp-client`, `mcp-server`, `observability`, `governance`, and `catalog-mcp`.
- CI publishes bundle-size guard results via `pnpm ci:size` and enforces the Vitest e2e suite that exercises the CLI ⇄ runner ⇄ server flow (including SSE/WebSocket + MCP metadata).
- Local smoke testing via [act](https://github.com/nektos/act) works with `act workflow_dispatch -W .github/workflows/ts-ci.yml` once `pnpm` is installed inside the runner image.

---

## Release Workflow (2.0.x)

1. Update `CHANGELOG.md` (`## [Unreleased]`) and move entries under a dated `## [2.0.x]` section when shipping.  
   Reference the governance updates, CLI surface, and deprecation of Python assets.
2. Run validation:
   ```bash
   pnpm ci:lint
   pnpm ci:typecheck
   pnpm ci:build
   pnpm ci:test
   pnpm ci:e2e
   pnpm ci:size
   pnpm --filter docs lint || uv run python ops/tools/check_docs.py
   ```
   Capture command output (and any skipped steps) in the release notes.
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
| `@magsag/mcp-server` | TypeScript MCP runtime with HTTP/SSE/STDIO fallback & CLI integration |
| `@magsag/catalog-mcp` | Catalog MCP tool definitions (Task decomposition, aggregation, placeholders) |
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
