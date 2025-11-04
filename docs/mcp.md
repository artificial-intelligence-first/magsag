---
title: Remote MCP Client
slug: remote-mcp-client
status: living
last_updated: '2025-11-05'
last_synced: '2025-11-04'
tags:
  - mcp
  - integration
summary: TypeScript-first MCP client guidance, fallback diagnostics, and CLI workflows for MAGSAG 2.0.
description: End-to-end reference for configuring MCP transports, invoking servers with the new TypeScript client, running the CLI doctor tooling, and wiring the shared TypeScript runtime.
authors: []
sources: []
---

# Remote MCP Client

> **For Humans**: Use this document when provisioning MCP presets, validating connectivity, or embedding the TypeScript runtime inside new surfaces.
>
> **For AI Agents**: Prefer the `@magsag/mcp-client` and CLI utilities described here. Do not resurrect the legacy Python runtime.

## Highlights

- TypeScript `@magsag/mcp-client` delivers HTTP → SSE → stdio fallback, retries, and circuit breaking by default.
- `magsag mcp ls` and `magsag mcp doctor` replace the Python CLI scripts for enumerating tools and diagnosing connectivity.
- `@magsag/mcp-server` exposes a runtime helper for shipping MCP servers with minimal boilerplate.
- `@magsag/catalog-mcp` publishes catalog tool definitions that the CLI auto-registers for MAG/SAG runners.
- Presets live under `ops/adk/servers/*.yaml`; they are loaded by the CLI with environment interpolation.

## Quick Start

```bash
# 1. Ensure dependencies are installed
pnpm install

# 2. Inspect available presets (reads ops/adk/servers/*.yaml)
pnpm --filter @magsag/cli exec magsag mcp ls

# 3. Enumerate tools exposed by a preset with fallback transport resolution
pnpm --filter @magsag/cli exec magsag mcp ls notion

# 4. Diagnose connectivity issues and auth gaps
pnpm --filter @magsag/cli exec magsag mcp doctor supabase --json
```

The CLI commands automatically expand shell-style `${VAR}` placeholders defined inside each preset and attempt transports in the declared order. Results are printable as JSON for automation, or as human-readable text for local debugging.

## Runner Integration

- `magsag agent run` now launches the catalog MCP runtime automatically and injects `MAGSAG_MCP_*` environment variables into MAG/SAG engines.
- Tool definitions are provided by `@magsag/catalog-mcp`; update the package when catalog skills evolve.
- Runtime start/stop events are logged ahead of runner output so operators can confirm tool availability.

## CLI Reference

### `mcp ls`

Lists presets when no `server` argument is provided. When a server ID is supplied, it connects using HTTP → SSE → stdio fallbacks until a transport succeeds.

```bash
pnpm --filter @magsag/cli exec magsag mcp ls github
```

Sample output:

```
Tools exposed by 'github' via HTTP https://api.githubcopilot.com/mcp/:
  • github.get_repo — Retrieve repository metadata
  • github.create_issue — Open an issue (approval gated)
```

Add `--json` for machine-readable output.

### `mcp doctor`

Diagnoses connectivity, mapping common failure modes to `reachable`, `needs-auth`, `auth-failed`, or `unreachable`.

```bash
pnpm --filter @magsag/cli exec magsag mcp doctor notion
```

Example:

```
Server 'notion': REACHABLE via HTTP https://mcp.notion.com/mcp
```

If the primary transport fails, subsequent entries (e.g. SSE or stdio) are attempted automatically. Add `--json` to embed the results in scripts or CI logs.

## TypeScript Client Usage

Use the `McpClient` directly when embedding MCP interactions in services or custom tooling.

```ts
import { McpClient, McpClientError } from '@magsag/mcp-client';

const client = new McpClient({
  serverId: 'notion',
  transport: {
    type: 'http',
    url: 'https://mcp.notion.com/mcp'
  },
  requestTimeoutMs: 15_000
});

await client.initialize();
const tools = await client.listTools({ refresh: true });

for (const tool of tools.tools) {
  console.log(`${tool.name}: ${tool.description ?? '—'}`);
}

type EchoArgs = { text: string };
const result = await client.invokeTool('echo', { text: 'hello world' } satisfies EchoArgs);

if (result.isError) {
  throw new McpClientError('Echo tool failed');
}

await client.close();
```

The client automatically applies exponential backoff with jitter, circuit-breaking, and transport-specific error handling. Inspect `client.getCircuitState()` after retries when surfacing status in observability dashboards.

## Runtime Helper (`@magsag/mcp-server`)

Bootstrap servers with the provided runtime helper instead of stitching together transports manually.

```ts
import { createMcpServerRuntime } from '@magsag/mcp-server';
import { z } from 'zod';

const runtime = createMcpServerRuntime({
  implementation: {
    name: 'magsag-sample-server',
    version: '1.0.0'
  },
  http: {
    host: '127.0.0.1',
    port: 3210,
    path: '/mcp'
  }
});

runtime.registerTool({
  name: 'echo',
  description: 'Echo back the provided text',
  inputSchema: {
    text: z.string()
  },
  handler: async (args) => ({
    content: [
      {
        type: 'text',
        text: String(args.text)
      }
    ],
    isError: false
  })
});

await runtime.start();
console.log('MCP runtime listening on', runtime.getHttpAddress()?.url.href);
```

The runtime assigns a unique HTTP session per client, sends `Mcp-Session-Id` headers automatically, and honours DNS re-binding guards when configured through the preset. Registering additional tools after startup updates active sessions and triggers `tools/list_changed` notifications automatically.

## Presets & Environment Expansion

Each preset in `ops/adk/servers/*.yaml` contains the primary transport plus ordered fallbacks:

```yaml
id: supabase
transport:
  type: http
  url: "https://mcp.supabase.com/mcp"
fallback:
  - type: sse
    url: "https://mcp.supabase.com/sse"
  - type: stdio
    command: "npx"
    args: ["-y", "mcp-remote", "https://mcp.supabase.com/mcp"]
```

Strings like `${SUPABASE_TOKEN}` follow shell-style expansion. `mcp doctor` expands them using `process.env` so CI pipelines can inject credentials prior to diagnosis. Keep presets under source control and note changes in `docs/development/plans/typescript-full-migration.md`.

## Governance & Observability

- Gate write-capable tools using `catalog/policies/mcp_permissions.yaml`. The CLI reflects policy annotations when listing tools.
- Log doctor runs inside delivery notes to capture skipped transports or manual interventions.
- Emit MCP call metrics via `@magsag/observability` by forwarding `McpClient` events; the runtime exposes call counts and error rates through the session close hook.

## Migration Notes

- The legacy Python modules (`magsag.mcp.*`) were removed. Replace any remaining imports with the TypeScript client or CLI.
- Skills still implemented in Python should guard against missing MCP runtimes and surface actionable errors until the TypeScript skill runtime lands.
- Document fallback or authentication exceptions inside `docs/development/plans/typescript-full-migration.md` under *Surprises & Discoveries*.

## Further Reading

- `docs/guides/mcp-integration.md` — Operational playbook for presets, approval policies, and observability wiring.
- `docs/guides/mcp-server.md` — Detailed walkthrough for authoring new MCP servers with the TypeScript runtime.
- `catalog/policies/mcp_permissions.yaml` — Canonical permissions matrix.
