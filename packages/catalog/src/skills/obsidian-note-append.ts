import { appendNote, type AppendNoteArgs, type AppendNoteResult } from '@magsag/servers/obsidian';
import { SkillContext, McpRuntime } from '../shared/types.js';

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

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  validatePayload(payload);
  const runtime = ensureRuntime(context);

  const path = payload.path as string;
  const content = payload.content as string;
  const createIfMissing = payload.create_if_missing as boolean | undefined;

  const argumentsPayload: AppendNoteArgs = {
    path,
    content
  };
  if (createIfMissing !== undefined) {
    argumentsPayload.create_if_missing = createIfMissing;
  }

  const success: AppendNoteResult = await appendNote(runtime, argumentsPayload);
  return {
    result: success
  };
};
