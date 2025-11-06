import { randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';
import { Args, Flags, Parser } from '@oclif/core';
import { SimpleManager } from '@magsag/manager';
import type { AgentContext, Plan, TaskSpec } from '@magsag/core';
import { resolvePrompt, resolveRepo } from './agent-run.js';
import type { CliStreams } from '../utils/streams.js';
import { writeLine } from '../utils/streams.js';

export interface ParsedAgentPlan {
  prompt: string;
  repo: string;
  worktreeRoot?: string;
  outputPath?: string;
}

const planFlags = {
  repo: Flags.string({
    char: 'r',
    summary: 'Repository root used when generating the plan',
    description: 'Absolute or relative path to the repository that the MAG/SAG workflow will operate against.'
  }),
  worktreeRoot: Flags.string({
    summary: 'Directory used as the root for git worktrees (optional)',
    description: 'Overrides the default worktree root derived from the repository when preparing SAG delegations.'
  }),
  output: Flags.string({
    char: 'o',
    summary: 'Write the generated plan to a file',
    description: 'If omitted, the plan is printed to STDOUT as formatted JSON.'
  })
} as const;

const planArgs = {
  prompt: Args.string({
    name: 'prompt',
    description: 'High-level task description for the MAG to plan.',
    required: false
  })
} as const;

export const parseAgentPlan = async (argv: string[]): Promise<ParsedAgentPlan> => {
  const parsed = await Parser.parse(argv, {
    flags: planFlags,
    args: planArgs,
    strict: true
  });

  const prompt = await resolvePrompt(parsed.args.prompt);
  const repo = resolveRepo(parsed.flags.repo);
  const worktreeRoot = parsed.flags.worktreeRoot?.trim().length
    ? parsed.flags.worktreeRoot
    : undefined;
  const outputPath = parsed.flags.output?.trim().length ? parsed.flags.output : undefined;

  return { prompt, repo, worktreeRoot, outputPath };
};

const buildTaskSpec = (prompt: string): TaskSpec => ({
  id: `task-${randomUUID()}`,
  goal: prompt,
  metadata: {
    source: 'cli',
    createdAt: new Date().toISOString()
  }
});

const buildAgentContext = (repo: string, worktreeRoot?: string): AgentContext => ({
  repoDir: repo,
  worktreeRoot
});

export const agentPlanHandler = async (
  parsed: ParsedAgentPlan,
  streams: CliStreams
): Promise<number> => {
  const manager = new SimpleManager();
  const task = buildTaskSpec(parsed.prompt);
  const context = buildAgentContext(parsed.repo, parsed.worktreeRoot);

  const plan: Plan = await manager.createPlan(task, context);
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;

  if (parsed.outputPath) {
    await fs.mkdir(dirname(parsed.outputPath), { recursive: true });
    await fs.writeFile(parsed.outputPath, serialized, 'utf8');
    writeLine(streams.stderr, `Plan written to ${parsed.outputPath}`);
  } else {
    writeLine(streams.stdout, serialized.trimEnd());
  }

  return 0;
};
