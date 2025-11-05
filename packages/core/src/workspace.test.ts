import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ExecutionWorkspace } from './workspace.js';

const waitForExit = (child: ReturnType<typeof spawn>): Promise<{ code: number | null; signal: NodeJS.Signals | null }> =>
  new Promise((resolve) => {
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });

describe('ExecutionWorkspace', () => {
  it('creates and removes workspace directories when keep=false', async () => {
    const workspace = await ExecutionWorkspace.create({ keep: false });
    await access(workspace.path, constants.F_OK);
    await workspace.finalize();
    await expect(access(workspace.path, constants.F_OK)).rejects.toBeDefined();
  });

  it('terminates processes that exceed the wall clock limit', async () => {
    const logs: string[] = [];
    const workspace = await ExecutionWorkspace.create(
      {
        keep: false,
        limits: { wallClockMs: 100 }
      },
      ({ message }) => {
        logs.push(message);
      }
    );

    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000);'], {
      env: {
        ...process.env,
        ...workspace.environment()
      }
    });

    workspace.attach(child);
    const result = await waitForExit(child);
    await workspace.finalize();

    expect(result.code).not.toBe(0);
    expect(logs.some((entry) => entry.includes('wall clock limit'))).toBe(true);
  });
});
