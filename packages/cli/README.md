# @magsag/cli

The official command-line interface for the MAGSAG framework.

## Overview

`@magsag/cli` provides the `magsag` command-line tool for managing and executing AI agent workflows with governance controls. It offers commands for agent planning, execution, flow governance, worktree management, and MCP (Model Context Protocol) server operations.

## Installation

This package is part of the MAGSAG monorepo and should be built using pnpm:

```bash
pnpm install
pnpm -r build
```

## Usage

```bash
# Display help
pnpm --filter @magsag/cli exec magsag --help

# Create an agent plan
pnpm --filter @magsag/cli exec magsag agent plan --repo . "Investigate flaky CI"

# Execute a plan with concurrency control
pnpm --filter @magsag/cli exec magsag agent exec \
  --plan plan.json \
  --concurrency 4 \
  --provider-map "claude-cli:2,codex-cli"

# List worktrees
pnpm --filter @magsag/cli exec magsag worktrees:ls

# Garbage collect expired worktrees
pnpm --filter @magsag/cli exec magsag worktrees:gc --ttl 3600

# List MCP servers
pnpm --filter @magsag/cli exec magsag mcp:ls

# Check MCP server configuration
pnpm --filter @magsag/cli exec magsag mcp:doctor
```

## Main Commands

- **agent plan** - Generate execution plans for agent workflows
- **agent exec** - Execute agent plans with concurrency and provider controls
- **worktrees:ls** - List active Git worktrees
- **worktrees:gc** - Garbage collect expired worktrees
- **mcp:ls** - List available MCP servers
- **mcp:doctor** - Validate MCP server configuration
- **runs describe** - Display execution run details from JSONL logs

## Engine Configuration

The CLI supports multiple execution engines controlled via environment variables:

- `ENGINE_MODE` - `auto|subscription|api|oss` (default: `auto`)
- `ENGINE_MAG` - MAG runner: `codex-cli|openai-agents|adk` (default: `codex-cli`)
- `ENGINE_SAG` - SAG runner: `claude-cli|claude-agent|adk` (default: `claude-cli`)

## Output

Execution runs stream subtask state and write JSONL logs to `.magsag/runs/<id>.jsonl`, which can be replayed using `magsag runs describe <id>`.

## Dependencies

This package depends on:
- `@magsag/core` - Core engine contracts and types
- `@magsag/governance` - Flow governance and policy evaluation
- `@magsag/observability` - Metrics and logging
- `@magsag/manager` - Parallel execution planner
- `@magsag/worktree` - Git worktree management
- `@magsag/mcp-client` - MCP transport layer
- All runner packages (`runner-*`) - Engine implementations
- `@oclif/core` - CLI framework

## Development

```bash
# Run tests
pnpm --filter @magsag/cli test

# Type checking
pnpm --filter @magsag/cli typecheck

# Linting
pnpm --filter @magsag/cli lint

# Build
pnpm --filter @magsag/cli build
```

## Architecture

The CLI uses [oclif](https://oclif.io/) as its framework, providing a robust command structure with auto-generated help documentation. Commands are organized into logical groups (agent, worktrees, mcp, runs) and leverage the full MAGSAG stack for execution.

## License

Apache-2.0
