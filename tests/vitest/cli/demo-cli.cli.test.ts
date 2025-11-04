import { afterEach, describe, expect, it, vi } from 'vitest';

const demoCliModuleUrl = new URL(
  '../../../apps/demo-cli/src/index.ts',
  import.meta.url
);

describe('demo CLI entrypoint', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('logs the placeholder message', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await import(demoCliModuleUrl.href);

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('Demo CLI placeholder');
  });
});
