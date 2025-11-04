import { SkillContext, McpRuntime, McpToolResult } from '../shared/types.js';

const ensureRuntime = (context: SkillContext): McpRuntime => {
  if (!context.mcp) {
    throw new Error("notion-page-lookup requires an MCP runtime with the 'notion' server.");
  }
  return context.mcp;
};

const validatePayload = (payload: Record<string, unknown>): void => {
  if (typeof payload.page_id !== 'string' || payload.page_id.trim().length === 0) {
    throw new Error("notion_page_lookup_input.page_id must be a non-empty string");
  }
  if (
    payload.include_children !== undefined &&
    typeof payload.include_children !== 'boolean'
  ) {
    throw new Error('notion_page_lookup_input.include_children must be a boolean');
  }
};

const ensureSuccess = (result: McpToolResult | undefined): McpToolResult => {
  if (!result || !result.success) {
    throw new Error(result?.error ?? 'Notion retrieve_page failed');
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
    page_id: payload.page_id
  };
  if (payload.include_children !== undefined) {
    argumentsPayload.include_children = payload.include_children;
  }

  const result = await runtime.executeTool?.({
    serverId: 'notion',
    toolName: 'retrieve_page',
    arguments: argumentsPayload
  });

  const success = ensureSuccess(result);
  return {
    page: success.output
  };
};
