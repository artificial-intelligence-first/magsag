import { z } from 'zod';
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
    // If inputSchema is a ZodRawShape, wrap it in z.object()
    // If it's already a ZodObject, use it as-is
    let inputSchema: z.ZodObject<any> | undefined;
    if (tool.inputSchema) {
      if (tool.inputSchema instanceof z.ZodObject) {
        inputSchema = tool.inputSchema;
      } else if (typeof tool.inputSchema === 'object' && Object.keys(tool.inputSchema).length > 0) {
        inputSchema = z.object(tool.inputSchema);
      }
    }

    let outputSchema: z.ZodObject<any> | undefined;
    if (tool.outputSchema) {
      if (tool.outputSchema instanceof z.ZodObject) {
        outputSchema = tool.outputSchema;
      } else if (typeof tool.outputSchema === 'object' && Object.keys(tool.outputSchema).length > 0) {
        outputSchema = z.object(tool.outputSchema);
      }
    }

    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: inputSchema as any,
        outputSchema: tool.outputSchema as any,
        annotations: tool.annotations
      },
      (args, extra) => tool.handler(args ?? {}, extra)
    );
  }
}
