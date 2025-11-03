import { execa } from 'execa';
import split2 from 'split2';
import type { Runner, RunnerEvent, RunSpec } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

const DEFAULT_BINARY = 'codex';

type CodexNdjsonEvent = {
  type?: string;
  content?: string;
  role?: 'assistant' | 'tool' | 'system';
  files?: Array<{ path: string; patch: string }>;
  session_id?: string;
  stats?: Record<string, unknown>;
  error?: { message?: string; code?: string; details?: Record<string, unknown> };
  data?: string;
};

const mapCodexEvent = (evt: CodexNdjsonEvent, raw: string): RunnerEvent[] => {
  if (!evt || typeof evt !== 'object') {
    return [{ type: 'log', data: raw }];
  }

  switch (evt.type) {
    case 'message':
      if (evt.content) {
        return [
          {
            type: 'message',
            role: evt.role ?? 'assistant',
            content: evt.content
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
    case 'final_message':
    case 'done': {
      const events: RunnerEvent[] = [];
      if (evt.content) {
        events.push({
          type: 'message',
          role: evt.role ?? 'assistant',
          content: evt.content
        });
      }
      events.push({
        type: 'done',
        sessionId: evt.session_id,
        stats: evt.stats
      });
      return events;
    }
    case 'log':
      if (typeof evt.data === 'string') {
        return [{ type: 'log', data: evt.data }];
      }
      return [];
    case 'error':
      return [
        {
          type: 'error',
          error: {
            message: evt.error?.message ?? 'codex-cli reported an error',
            code: evt.error?.code,
            details: evt.error?.details
          }
        }
      ];
    default:
      if (evt.content) {
        return [
          {
            type: 'message',
            role: evt.role ?? 'assistant',
            content: evt.content
          }
        ];
      }
      return [{ type: 'log', data: raw }];
  }
};

export interface CodexCliRunnerOptions {
  /** Overrides the codex CLI binary name. */
  binary?: string;
}

export class CodexCliRunner implements Runner {
  constructor(private readonly options: CodexCliRunnerOptions = {}) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);

    const args = validated.resumeId
      ? ['resume', validated.resumeId, '--json']
      : ['exec', '--json', validated.prompt];

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
      throw new Error('codex CLI did not expose a combined output stream');
    }

    let sawDone = false;

    for await (const line of stream.pipe(split2())) {
      const text = line.toString();
      if (!text.trim()) {
        continue;
      }
      let parsed: CodexNdjsonEvent | undefined;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      const fallbackEvent: RunnerEvent = { type: 'log', data: text };
      const events = parsed ? mapCodexEvent(parsed, text) : [fallbackEvent];
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
      const message = error instanceof Error ? error.message : 'codex CLI failed';
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

export const createCodexCliRunner = (
  options?: CodexCliRunnerOptions
): Runner => new CodexCliRunner(options);
