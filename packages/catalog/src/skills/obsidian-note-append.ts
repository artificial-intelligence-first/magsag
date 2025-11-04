import { SkillContext, McpRuntime, McpToolResult } from '../shared/types.js';

const ensureRuntime = (context: SkillContext): McpRuntime => {
  if (!context.mcp) {
    throw new Error("obsidian-note-append requires an MCP runtime with the 'obsidian' server.");
  }
  return context.mcp;
};

const validatePayload = (payload: Record<string, unknown>): void => {
  if (typeof payload.path !== 'string' || payload.path.trim().length === 0) {
    throw new Error("obsidian_note_append_input.path must be a non-empty string");
  }
  if (typeof payload.content !== 'string' || payload.content.length === 0) {
    throw new Error("obsidian_note_append_input.content must be a non-empty string");
  }
  if (
    payload.create_if_missing !== undefined &&
    typeof payload.create_if_missing !== 'boolean'
  ) {
    throw new Error('obsidian_note_append_input.create_if_missing must be a boolean');
  }
};

const ensureSuccess = (result: McpToolResult | undefined): McpToolResult => {
  if (!result || !result.success) {
    throw new Error(result?.error ?? 'Obsidian append_note failed');
  }
  return result;
};

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  validatePayload(payload);
  const runtime = ensureRuntime(context);

  const argumentsPayload: Record<string, unknown> = {
    path: payload.path,
    content: payload.content
  };
  if (payload.create_if_missing !== undefined) {
    argumentsPayload.create_if_missing = payload.create_if_missing;
  }

  const result = await runtime.executeTool?.({
    serverId: 'obsidian',
    toolName: 'append_note',
    arguments: argumentsPayload
  });

  const success = ensureSuccess(result);
  return {
    result: success.output
  };
};
