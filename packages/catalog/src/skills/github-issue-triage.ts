import { listIssues, type ListIssuesArgs, type ListIssuesResult } from '@magsag/servers/github';
import { SkillContext, McpRuntime } from '../shared/types.js';

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

export const run = async (
  payload: Record<string, unknown>,
  context: SkillContext = {}
): Promise<Record<string, unknown>> => {
  validatePayload(payload);
  const runtime = ensureRuntime(context);

  const owner = payload.owner as string;
  const repo = payload.repo as string;
  const state = (payload.state as ListIssuesArgs['state'] | undefined) ?? undefined;
  const labels = payload.labels as string[] | undefined;

  const argumentsPayload: ListIssuesArgs = {
    owner,
    repo
  };
  if (state !== undefined) {
    argumentsPayload.state = state;
  }
  if (labels !== undefined) {
    argumentsPayload.labels = labels;
  }

  const success: ListIssuesResult = await listIssues(runtime, argumentsPayload);
  return {
    issues: success
  };
};
