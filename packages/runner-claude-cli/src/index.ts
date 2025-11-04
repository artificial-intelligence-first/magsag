import { execa } from 'execa';
import split2 from 'split2';
import type { Runner, RunnerEvent, RunSpec } from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

const DEFAULT_BINARY = 'claude';

const MESSAGE_ROLES = ['assistant', 'tool', 'system'] as const;

type RunnerMessageRole = (typeof MESSAGE_ROLES)[number];

interface ClaudeStreamMessage {
  role?: RunnerMessageRole;
  content?: string;
}

interface ClaudeStreamFile {
  path: string;
  patch: string;
}

interface ClaudeStreamError {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

interface ClaudeStreamEvent {
  type?: string;
  message?: ClaudeStreamMessage;
  content?: string;
  role?: RunnerMessageRole;
  files?: ClaudeStreamFile[];
  session_id?: string;
  stats?: Record<string, unknown>;
  error?: ClaudeStreamError;
}

const isClaudeStreamEvent = (value: unknown): value is ClaudeStreamEvent =>
  typeof value === 'object' && value !== null;

const resolveRole = (role?: RunnerMessageRole): RunnerMessageRole => {
  if (role && MESSAGE_ROLES.includes(role)) {
    return role;
  }
  return 'assistant';
};

const mapClaudeEvent = (evt: ClaudeStreamEvent, raw: string): RunnerEvent[] => {
  const payload: ClaudeStreamMessage | ClaudeStreamEvent = evt.message ?? evt;
  const role = resolveRole(payload.role);

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

    const env = { ...process.env };
    const mcp = validated.extra?.mcp;
    if (mcp?.runtime) {
      env.MAGSAG_MCP_SERVER_URL = mcp.runtime.url;
      env.MAGSAG_MCP_SERVER_HOST = mcp.runtime.host;
      env.MAGSAG_MCP_SERVER_PORT = String(mcp.runtime.port);
      env.MAGSAG_MCP_SERVER_PATH = mcp.runtime.path;
      env.MCP_SERVER = mcp.runtime.url;
      if (mcp.tools?.length) {
        env.MAGSAG_MCP_TOOLS = mcp.tools.join(',');
      }
    }

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
      all: true,
      env
    });

    const stream = child.all;
    if (!stream) {
      throw new Error('claude CLI did not expose a combined output stream');
    }

    let sawDone = false;

    const lineStream = stream.pipe(split2());
    for await (const chunk of lineStream as AsyncIterable<string | Buffer>) {
      const text = typeof chunk === 'string' ? chunk : chunk.toString();
      if (!text.trim()) {
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text) as unknown;
      } catch {
        parsed = undefined;
      }
      const events: RunnerEvent[] = isClaudeStreamEvent(parsed)
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
