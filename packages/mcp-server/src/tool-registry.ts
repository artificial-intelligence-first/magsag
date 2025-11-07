import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from './types.js';

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool '${tool.name}' is already registered.`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  apply(server: McpServer): void {
    for (const tool of this.tools.values()) {
      this.applyTool(server, tool);
    }
  }

  applyTool(server: McpServer, tool: ToolDefinition): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const inputSchema = (tool.inputSchema ?? {}) as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const outputSchema = tool.outputSchema as any;

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema,
        outputSchema,
        annotations: tool.annotations
      },
      (args, extra) => tool.handler(args ?? {}, extra)
    );
  }
}
