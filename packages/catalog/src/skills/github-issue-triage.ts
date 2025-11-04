import { SkillContext, McpRuntime, McpToolResult } from '../shared/types.js';

const STATES = new Set(['open', 'closed', 'all']);

const ensureRuntime = (context: SkillContext): McpRuntime => {
  if (!context.mcp) {
    throw new Error("github-issue-triage requires an MCP runtime with the 'github' server.");
  }
  return context.mcp;
};

const validatePayload = (payload: Record<string, unknown>): void => {
  if (typeof payload.owner !== 'string' || payload.owner.trim().length === 0) {
    throw new Error("github_issue_triage_input.owner must be a non-empty string");
  }
  if (typeof payload.repo !== 'string' || payload.repo.trim().length === 0) {
    throw new Error("github_issue_triage_input.repo must be a non-empty string");
  }

  if (payload.state !== undefined) {
    if (typeof payload.state !== 'string' || !STATES.has(payload.state)) {
      throw new Error("github_issue_triage_input.state must be one of 'open', 'closed', or 'all'");
    }
  }

  if (payload.labels !== undefined) {
    if (!Array.isArray(payload.labels) || !payload.labels.every((item) => typeof item === 'string')) {
      throw new Error('github_issue_triage_input.labels must be an array of strings');
    }
  }
};

const ensureSuccess = (result: McpToolResult | undefined): McpToolResult => {
  if (!result || !result.success) {
    throw new Error(result?.error ?? 'GitHub list_issues failed');
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
    owner: payload.owner,
    repo: payload.repo
  };
  if (payload.state !== undefined) {
    argumentsPayload.state = payload.state;
  }
  if (payload.labels !== undefined) {
    argumentsPayload.labels = payload.labels;
  }

  const result = await runtime.executeTool?.({
    serverId: 'github',
    toolName: 'list_issues',
    arguments: argumentsPayload
  });

  const success = ensureSuccess(result);
  return {
    issues: success.output
  };
};
