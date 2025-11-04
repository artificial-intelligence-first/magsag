---
title: MCP Tool Skill Template
slug: skill-template-mcp
status: living
last_updated: '2025-11-01'
last_synced: '2025-11-01'
tags:
- catalog
- skill
- mcp
summary: Template for documenting MCP-backed skills, including contracts, procedures,
  and fallbacks.
authors: []
sources: []
name: <skill-name>
description: 'MCP tool wrapper for <tool-purpose>. Replace this with your tool''s
  description.

  '
iface:
  input_schema: contracts/<input-contract>.json
  output_schema: contracts/<output-contract>.json
mcp:
  server_ref: <mcp-server-id>
slo:
  success_rate_min: 0.99
  latency_p95_ms: 1000
limits:
  rate_per_min: 60
---

# <Skill Display Name> (<skill-name>)

> **For Humans**: Use this template when wrapping MCP tools as catalog skills.
>
> **For AI Agents**: Populate every field, validate contracts, and document fallback logic.

## Purpose
MCP Tool Template provides a standardized structure for creating skills that wrap Model Context Protocol (MCP) tools. This template demonstrates how to integrate external MCP servers into the MAGSAG framework while maintaining contract validation, error handling, and observability requirements.

## When to Use
- You need to integrate an external MCP tool as a reusable skill
- The MCP server source lives in `ops/adk/servers/<server-id>.yaml` and produces `.mcp/servers/<server-id>.json`
- Input and output data structures are defined via JSON Schema contracts
- The tool will be invoked by agents or other orchestration workflows

## Prerequisites
- MCP server configured via `ops/adk/servers/<server-id>.yaml` and regenerated to `.mcp/servers/<server-id>.json`
- Input schema defined at `catalog/contracts/<input-contract>.json`
- Output schema defined at `catalog/contracts/<output-contract>.json`
- Environment variables required by the MCP server (if any) are set
- Rate limits configured in the MCP server configuration

## Procedures

### Procedure 1: Invoke MCP Tool
1. **Validate Input** - Ensure the input payload conforms to the input schema contract
2. **Prepare Request** - Extract relevant fields from the payload and format them for the MCP tool
3. **Call MCP Tool** - Invoke the MCP server tool with prepared arguments
4. **Handle Response** - Process the MCP tool response and transform it to match the output schema
5. **Error Handling** - Catch and handle common errors (rate limits, timeouts, validation failures)
6. **Validate Output** - Ensure the output conforms to the output schema contract

### Procedure 2: Fallback Behavior
1. If the MCP tool is unavailable, return a structured error response
2. Log the failure with appropriate context for debugging
3. Consider returning cached results if applicable
4. Emit warnings when operating in degraded mode

## Examples

### Example 1: Basic Tool Invocation
- **Input**: [resources/examples/in.json](resources/examples/in.json)
- **Process**:
  1. Validate input against schema
  2. Call MCP tool with extracted parameters
  3. Transform response to output format
 4. Validate output against schema
- **Output**: [resources/examples/out.json](resources/examples/out.json)

## Update Log

- 2025-11-01: Added unified frontmatter and audience guidance to the MCP skill template.

## Implementation Notes

### File Structure
```
<skill-name>/
├── SKILL.md                    # This file
├── impl/
│   └── mcp-tool.ts            # Tool implementation
├── resources/
│   └── examples/
│       ├── in.json            # Sample input
│       └── out.json           # Sample output
└── tests/
    └── mcp-tool.test.ts       # Vitest specs
```

### Key Functions
- `export const run = async (payload: Record<string, unknown>, context: McpToolContext = {}): Promise<Record<string, unknown>>` – Main entry point with optional MCP runtime metadata
- `const validate = (payload: unknown, schema: JsonSchema, name: string): void` – Input/output validation helper
- `const prepareRequest = (payload: Record<string, unknown>): Record<string, unknown>` – Request transformation helper
- `const callMcpTool = async (args: Record<string, unknown>): Promise<unknown>` – Local or mocked execution path when MCP runtime is unavailable
- `const callToolViaRuntime = async (runtime: McpRuntime, request: Record<string, unknown>): Promise<unknown>` – Preferred MCP runtime integration path
- `const processResponse = (raw: unknown, payload: Record<string, unknown>): Record<string, unknown>` – Response normalization helper

### Development Checklist
- [ ] Copy template to `catalog/skills/<your-skill-name>/`
- [ ] Update `name`, `description`, and `mcp.server_ref` in SKILL.md frontmatter
- [ ] Define input/output contracts in `catalog/contracts/`
- [ ] Implement `callMcpTool()` in `impl/mcp-tool.ts`
- [ ] Create example payloads in `resources/examples/`
- [ ] Write tests in `tests/mcp-tool.test.ts`
- [ ] Run `pnpm ci:lint` / `pnpm ci:typecheck` to ensure code quality
- [ ] Run `pnpm vitest --run --project unit` to verify tests pass
- [ ] Register skill in `catalog/registry/skills.yaml` if needed

## Additional Resources
- `.mcp/README.md` - MCP server configuration guide
- `docs/guides/agent-development.md` - Skill development guidelines
- MCP Official Documentation: https://modelcontextprotocol.io/

## Troubleshooting
- **MCP Server Not Found**: Verify `ops/adk/servers/<server-id>.yaml` exists and `.mcp/servers/<server-id>.json` is up to date
- **Rate Limit Exceeded**: Check the `limits.rate_per_min` setting in SKILL.md and MCP server config
- **Schema Validation Errors**: Ensure contracts match actual payload structure
- **Timeout Errors**: Increase latency threshold or optimize MCP tool query
- **Missing Environment Variables**: Check MCP server requirements in `.env.example`
