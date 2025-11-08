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
    const normalizedInput = this.normalizeSchema(tool.inputSchema);
    const normalizedOutput = this.normalizeSchema(tool.outputSchema);

    const registered = server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: this.extractShape(normalizedInput),
        outputSchema: this.extractShape(normalizedOutput),
        annotations: tool.annotations
      },
      (args, extra) => tool.handler(args ?? {}, extra)
    );

    if (normalizedInput) {
      (registered as { inputSchema?: ZodObjectLike }).inputSchema = normalizedInput;
    }
    if (normalizedOutput) {
      (registered as { outputSchema?: ZodObjectLike }).outputSchema = normalizedOutput;
    }
  }

  private normalizeSchema(schema?: unknown): ZodObjectLike | undefined {
    if (!schema) {
      return undefined;
    }
    if (schema instanceof z.ZodObject) {
      return schema;
    }
    if (this.isForeignZodObject(schema)) {
      return schema;
    }
    if (typeof schema === 'object') {
      return z.object(schema as z.ZodRawShape);
    }
    return undefined;
  }

  private extractShape(schema?: ZodObjectLike): z.ZodRawShape | undefined {
    if (!schema) {
      return undefined;
    }
    if (schema instanceof z.ZodObject) {
      return schema.shape;
    }
    if (this.isForeignZodObject(schema)) {
      if (typeof schema.shape === 'function') {
        return schema.shape();
      }
      if (schema.shape && typeof schema.shape === 'object') {
        return schema.shape as z.ZodRawShape;
      }
      const defShape = schema._def?.shape;
      if (typeof defShape === 'function') {
        return defShape();
      }
    }
    return undefined;
  }

  private isForeignZodObject(value: unknown): value is ForeignZodObject {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const def = (value as ForeignZodObject)._def;
    return typeof def === 'object' && def?.typeName === 'ZodObject';
  }
}

type ForeignZodObject = {
  _def?: {
    typeName?: string;
    shape?: () => z.ZodRawShape;
  };
  shape?: z.ZodRawShape | (() => z.ZodRawShape);
};

type ZodObjectLike = z.ZodObject<z.ZodRawShape> | ForeignZodObject;
