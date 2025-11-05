import { retrievePage, type RetrievePageArgs, type RetrievePageResult } from '@magsag/servers/notion';
import { SkillContext, McpRuntime } from '../shared/types.js';

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

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  validatePayload(payload);
  const runtime = ensureRuntime(context);

  const pageId = payload.page_id as string;
  const includeChildren = payload.include_children as boolean | undefined;

  const argumentsPayload: RetrievePageArgs = {
    page_id: pageId
  };
  if (includeChildren !== undefined) {
    argumentsPayload.include_children = includeChildren;
  }

  const success: RetrievePageResult = await retrievePage(runtime, argumentsPayload);
  return {
    page: success
  };
};
