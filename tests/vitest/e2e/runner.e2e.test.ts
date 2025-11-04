import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ENGINE_SELECTION,
  ENGINE_ENV,
  type EngineId,
  type RunnerEvent,
  type RunnerFactory,
  InMemoryRunnerRegistry,
  resolveEngineSelection
} from '@magsag/core';
import { engineSelectionSchema, runSpecSchema } from '@magsag/schema';
import {
  createLogger,
  type LogEntry
} from '@magsag/shared-logging';

const makeFactory = (
  id: EngineId,
  events: readonly RunnerEvent[]
): RunnerFactory => ({
  id,
  create: () => ({
    async *run() {
      for (const event of events) {
        yield event;
      }
    }
  })
});

describe('runner registry end-to-end', () => {
  it('resolves engines, validates schemas, and streams events', async () => {
    const registry = new InMemoryRunnerRegistry();
    const magEvents: RunnerEvent[] = [
      { type: 'log', data: 'mag ready' },
      { type: 'done', sessionId: 'mag-session' }
    ];
    const sagEvents: RunnerEvent[] = [
      { type: 'log', data: 'sag ready' },
      { type: 'done', sessionId: 'sag-session' }
    ];

    registry.register(makeFactory('codex-cli', magEvents));
    registry.register(makeFactory('claude-cli', sagEvents));

    const env = {
      [ENGINE_ENV.mode]: 'subscription',
      [ENGINE_ENV.mag]: 'codex-cli',
      [ENGINE_ENV.sag]: 'claude-cli'
    } satisfies Record<string, string>;

    const selection = engineSelectionSchema.parse(
      resolveEngineSelection(env)
    );

    expect(selection).toStrictEqual({
      mode: 'subscription',
      mag: 'codex-cli',
      sag: 'claude-cli'
    });

    const runSpec = runSpecSchema.parse({
      engine: selection.mag,
      repo: '/tmp/magsag',
      prompt: 'smoke test'
    });

    const logEntries: LogEntry[] = [];
    const logger = createLogger({
      name: 'runner-e2e',
      level: 'debug',
      sink: (entry) => {
        logEntries.push(entry);
      }
    });

    const runnerFactory = registry.get(selection.mag);
    const sagFactory = registry.get(selection.sag);

    expect(runnerFactory).toBeDefined();
    expect(sagFactory).toBeDefined();

    const observedMagEvents: RunnerEvent[] = [];
    if (runnerFactory) {
      const runner = runnerFactory.create();
      for await (const event of runner.run(runSpec)) {
        observedMagEvents.push(event);
        if (event.type === 'log') {
          logger.info(event.data);
        }
      }
    }

    const observedSagEvents: RunnerEvent[] = [];
    if (sagFactory) {
      const runner = sagFactory.create();
      for await (const event of runner.run({ ...runSpec, engine: selection.sag })) {
        observedSagEvents.push(event);
        if (event.type === 'log') {
          logger.info(event.data);
        }
      }
    }

    expect(observedMagEvents).toStrictEqual(magEvents);
    expect(observedSagEvents).toStrictEqual(sagEvents);
    expect(logEntries).toHaveLength(2);
    expect(logEntries.map((entry) => entry.message)).toStrictEqual([
      'mag ready',
      'sag ready'
    ]);
    expect(logEntries.every((entry) => entry.name === 'runner-e2e')).toBe(true);
  });

  it('falls back to defaults when registry misses factories', () => {
    const selection = resolveEngineSelection({});
    expect(selection).toStrictEqual(DEFAULT_ENGINE_SELECTION);

    const registry = new InMemoryRunnerRegistry();
    expect(registry.get(selection.mag)).toBeUndefined();
  });
});
