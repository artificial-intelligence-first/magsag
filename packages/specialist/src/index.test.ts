import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

import type {
  DelegationRequest,
  DelegationResult,
  PlanStep,
  Runner,
  RunnerEvent,
  RunnerFactory,
  RunnerMcpMetadata,
  RunSpec
} from '@magsag/core';
import {
  RunnerSpecialistAgent,
  createWorktreeDelegationHandlers
} from './index.js';

const exec = promisify(execFile);

class RunSpecRecorder {
  private specs: RunSpec[] = [];

  record(spec: RunSpec): void {
    this.specs.push(spec);
  }

  get last(): RunSpec | undefined {
    return this.specs[this.specs.length - 1];
  }
}

const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test Bot',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test Bot',
  GIT_COMMITTER_EMAIL: 'test@example.com'
};

const initRepository = async (): Promise<string> => {
  const repoDir = await mkdtemp(join(tmpdir(), 'magsag-specialist-repo-'));
  await exec('git', ['init', '-b', 'main'], { cwd: repoDir, env: gitEnv });
  await writeFile(join(repoDir, 'README.md'), '# repo\n', 'utf8');
  await exec('git', ['add', 'README.md'], { cwd: repoDir, env: gitEnv });
  await exec('git', ['commit', '-m', 'Initial commit'], { cwd: repoDir, env: gitEnv });
  return repoDir;
};

const buildStep = (id: string): PlanStep => ({
  id,
  subtask: {
    id: `${id}-subtask`,
    taskId: 'task-1',
    title: `Title ${id}`,
    description: `Description for ${id}`
  }
});

describe('createWorktreeDelegationHandlers', () => {
  it('creates isolated worktrees and cleans up after completion', async () => {
    const repoDir = await initRepository();
    const handlers = createWorktreeDelegationHandlers({
      repoPath: repoDir,
      worktreesRoot: join(repoDir, '.worktrees'),
      baseRef: 'main'
    });

    const step = buildStep('step-1');
    const context = await handlers.prepare(step);
    expect(context.worktreePath).toContain('.worktrees');

    const statesBefore = await handlers.manager.list();
    expect(statesBefore).toHaveLength(1);

    const result: DelegationResult = {
      subtaskId: step.subtask.id,
      status: 'completed'
    };

    await handlers.finalize(step, context, result);

    const statesAfter = await handlers.manager.list();
    expect(statesAfter).toHaveLength(0);

    await rm(repoDir, { recursive: true, force: true });
  });
});

describe('RunnerSpecialistAgent', () => {
  const sampleMcp: RunnerMcpMetadata = {
    runtime: {
      url: 'http://127.0.0.1:4000/mcp',
      host: '127.0.0.1',
      port: 4000,
      path: '/mcp'
    }
  };

  const createFactory = (events: RunnerEvent[], specs: RunSpecRecorder[]) => {
    const recorder = new RunSpecRecorder();
    specs.push(recorder);
    return {
      id: 'codex-cli',
      create(): Runner {
        return {
          async *run(spec) {
            recorder.record(spec);
            for (const event of events) {
              yield event;
            }
          }
        } satisfies Runner;
      }
    } satisfies RunnerFactory;
  };

  it('builds run specs and streams runner events', async () => {
    const events: RunnerEvent[] = [{ type: 'log', data: 'hello' }];
    const specs: RunSpecRecorder[] = [];
    const factory = createFactory(events, specs);
    const agent = new RunnerSpecialistAgent({
      id: 'sag-stub',
      runnerFactory: factory,
      extraBuilder: (request) => ({
        requestId: request.subtask.id
      })
    });

    const request: DelegationRequest = {
      subtask: buildStep('step-1').subtask,
      context: {
        worktreePath: '/tmp/worktree',
        env: { FOO: 'bar' },
        metadata: { mcp: sampleMcp }
      }
    };

    const received: RunnerEvent[] = [];
    for await (const event of agent.execute(request)) {
      received.push(event);
    }

    expect(received).toEqual(events);
    expect(specs).toHaveLength(1);
    const spec = specs[0].last;
    expect(spec?.repo).toBe('/tmp/worktree');
    expect(spec?.prompt).toBe('Description for step-1');
    expect(spec?.engine).toBe('codex-cli');
    expect(spec?.extra).toEqual({
      requestId: 'step-1-subtask',
      env: { FOO: 'bar' },
      mcp: sampleMcp
    });
  });

  it('honours abort signals before dispatch', async () => {
    const events: RunnerEvent[] = [];
    const specs: RunSpecRecorder[] = [];
    const factory = createFactory(events, specs);
    const agent = new RunnerSpecialistAgent({
      id: 'sag-stub',
      runnerFactory: factory
    });

    const controller = new AbortController();
    controller.abort(new Error('stop'));

    const request: DelegationRequest = {
      subtask: buildStep('step-2').subtask,
      context: {
        worktreePath: '/tmp/worktree-2',
        env: {},
        metadata: {}
      }
    };

    await expect(async () => {
      for await (const event of agent.execute(request, controller.signal)) {
        void event;
      }
    }).rejects.toThrowError('stop');
    expect(specs[0].last).toBeUndefined();
  });
});
