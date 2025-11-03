import { execa } from 'execa';
import split2 from 'split2';
import type { Runner, RunnerEvent, RunSpec } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

const DEFAULT_BINARY = 'claude';

const MESSAGE_ROLES: Array<'assistant' | 'tool' | 'system'> = [
  'assistant',
  'tool',
  'system'
];

type RunnerMessageRole = (typeof MESSAGE_ROLES)[number];

type ClaudeStreamEvent = {
  type?: string;
  message?: { role?: RunnerMessageRole; content?: string };
  content?: string;
  role?: RunnerMessageRole;
  files?: Array<{ path: string; patch: string }>;
  session_id?: string;
  stats?: Record<string, unknown>;
  error?: { message?: string; code?: string; details?: Record<string, unknown> };
};

const mapClaudeEvent = (evt: ClaudeStreamEvent, raw: string): RunnerEvent[] => {
  if (!evt || typeof evt !== 'object') {
    return [{ type: 'log', data: raw }];
  }

  const payload = evt.message ?? evt;
  const role: RunnerMessageRole = MESSAGE_ROLES.includes(payload.role as RunnerMessageRole)
    ? (payload.role as RunnerMessageRole)
    : 'assistant';

  switch (evt.type) {
    case 'message':
    case 'content':
      if (payload.content) {
        return [
          {
            type: 'message',
            role,
            content: payload.content
          }
        ];
      }
      return [];
    case 'diff':
      if (Array.isArray(evt.files)) {
        return [
          {
            type: 'diff',
            files: evt.files.map((file) => ({
              path: file.path,
              patch: file.patch
            }))
          }
        ];
      }
      return [];
    case 'final':
    case 'done':
      return [
        {
          type: 'done',
          sessionId: evt.session_id,
          stats: evt.stats
        }
      ];
    case 'error':
      return [
        {
          type: 'error',
          error: {
            message: evt.error?.message ?? 'claude-cli reported an error',
            code: evt.error?.code,
            details: evt.error?.details
          }
        }
      ];
    default:
      if (payload.content) {
        return [
          {
            type: 'message',
            role,
            content: payload.content
          }
        ];
      }
      return [{ type: 'log', data: raw }];
  }
};

export interface ClaudeCliRunnerOptions {
  /** Overrides the claude CLI binary name. */
  binary?: string;
  /** Additional arguments to append to every invocation. */
  extraArgs?: string[];
}

export class ClaudeCliRunner implements Runner {
  constructor(private readonly options: ClaudeCliRunnerOptions = {}) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);

    // TODO: Confirm exact claude CLI subcommand naming once documentation is available.
    const baseArgs = validated.resumeId
      ? ['resume', validated.resumeId]
      : ['exec', '--prompt', validated.prompt];

    const args = [
      ...baseArgs,
      '--output-format',
      'stream-json',
      ...(this.options.extraArgs ?? [])
    ];

    yield {
      type: 'log',
      data: `Running ${this.binary()} ${args.join(' ')} in ${validated.repo}`
    };

    const child = execa(this.binary(), args, {
      cwd: validated.repo,
      all: true
    });

    const stream = child.all;
    if (!stream) {
      throw new Error('claude CLI did not expose a combined output stream');
    }

    let sawDone = false;

    for await (const line of stream.pipe(split2())) {
      const text = line.toString();
      if (!text.trim()) {
        continue;
      }
      let parsed: ClaudeStreamEvent | undefined;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      const events: RunnerEvent[] = parsed
        ? mapClaudeEvent(parsed, text)
        : [{ type: 'log', data: text }];
      for (const event of events) {
        if (event.type === 'done') {
          sawDone = true;
        }
        yield event;
      }
    }

    try {
      await child;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'claude CLI failed';
      yield {
        type: 'error',
        error: { message }
      };
    }

    if (!sawDone) {
      yield { type: 'done' };
    }
  }

  private binary(): string {
    return this.options.binary ?? DEFAULT_BINARY;
  }
}

export const createClaudeCliRunner = (
  options?: ClaudeCliRunnerOptions
): Runner => new ClaudeCliRunner(options);
