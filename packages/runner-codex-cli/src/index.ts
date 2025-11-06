import { execa } from 'execa';
import split2 from 'split2';
import {
  ExecutionWorkspace,
  buildRunnerMcpEnv,
  type Runner,
  type RunnerEvent,
  type RunSpec
} from '@magsag/core';
import { runSpecSchema } from '@magsag/schema';

const DEFAULT_BINARY = 'codex';

const CODEX_ROLES = ['assistant', 'tool', 'system'] as const;

type CodexRunnerRole = (typeof CODEX_ROLES)[number];

const ensureTrailingNewline = (value: string): string =>
  value.endsWith('\n') ? value : `${value}\n`;

interface CodexNdjsonFile {
  path: string;
  patch: string;
}

interface CodexNdjsonError {
  message?: string;
  code?: string;
  details?: Record<string, unknown>;
}

interface CodexNdjsonEvent {
  type?: string;
  content?: string;
  role?: CodexRunnerRole;
  files?: CodexNdjsonFile[];
  session_id?: string;
  stats?: Record<string, unknown>;
  error?: CodexNdjsonError;
  data?: string;
}

const isCodexNdjsonEvent = (value: unknown): value is CodexNdjsonEvent =>
  typeof value === 'object' && value !== null;

const resolveCodexRole = (role?: CodexRunnerRole): CodexRunnerRole => {
  if (role && CODEX_ROLES.includes(role)) {
    return role;
  }
  return 'assistant';
};

const normalizeCodexContent = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }
  if (value === undefined || value === null) {
    return undefined;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const mapCodexEvent = (evt: CodexNdjsonEvent, raw: string): RunnerEvent[] => {

  switch (evt.type) {
    case 'message':
      const messageContent = normalizeCodexContent(evt.content);
      if (messageContent) {
        return [
          {
            type: 'message',
            role: resolveCodexRole(evt.role),
            content: messageContent
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
      const doneContent = normalizeCodexContent(evt.content);
      if (doneContent) {
        events.push({
          type: 'message',
          role: resolveCodexRole(evt.role),
          content: doneContent
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
      const defaultContent = normalizeCodexContent(evt.content);
      if (defaultContent) {
        return [
          {
            type: 'message',
            role: resolveCodexRole(evt.role),
            content: defaultContent
          }
        ];
      }
      return [{ type: 'log', data: raw }];
  }
};

export interface CodexCliRunnerOptions {
  /** Overrides the codex CLI binary name. */
  binary?: string;
  /** Additional arguments appended to every invocation. */
  extraArgs?: string[];
}

export class CodexCliRunner implements Runner {
  constructor(private readonly options: CodexCliRunnerOptions = {}) {}

  async *run(spec: RunSpec): AsyncIterable<RunnerEvent> {
    const validated = runSpecSchema.parse(spec);
    const workspaceEvents: RunnerEvent[] = [];
    const flushWorkspace = function* (): Generator<RunnerEvent> {
      while (workspaceEvents.length > 0) {
        yield workspaceEvents.shift()!;
      }
    };

    const workspace = validated.extra?.workspace
      ? await ExecutionWorkspace.create(validated.extra.workspace, ({ channel, message }) => {
          workspaceEvents.push({ type: 'log', data: message, channel });
        })
      : null;

    const mcp = validated.extra?.mcp;
    const env = {
      ...process.env,
      ...(validated.extra?.env ?? {}),
      ...buildRunnerMcpEnv(mcp),
      ...(workspace ? workspace.environment() : {})
    };

    const baseArgs = validated.resumeId
      ? ['resume', validated.resumeId, '--json']
      : ['exec', '--json'];
    const args = [...baseArgs, ...(this.options.extraArgs ?? [])];

    const promptInput =
      !validated.resumeId && validated.prompt ? ensureTrailingNewline(validated.prompt) : undefined;

    yield {
      type: 'log',
      data: `Running ${this.binary()} ${args.join(' ')} in ${validated.repo}`
    };
    yield* flushWorkspace();

    const child = execa(this.binary(), args, {
      cwd: validated.repo,
      all: true,
      env,
      input: promptInput
    });
    workspace?.attach(child);

    const stream = child.all;
    if (!stream) {
      throw new Error('codex CLI did not expose a combined output stream');
    }

    let sawDone = false;

    try {
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
        const fallbackEvent: RunnerEvent = { type: 'log', data: text };
        const events = isCodexNdjsonEvent(parsed)
          ? mapCodexEvent(parsed, text)
          : [fallbackEvent];
        for (const event of events) {
          if (event.type === 'done') {
            sawDone = true;
          }
          yield event;
        }
        yield* flushWorkspace();
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
      yield* flushWorkspace();
    } finally {
      await workspace?.finalize();
      yield* flushWorkspace();
    }
  }

  private binary(): string {
    return this.options.binary ?? DEFAULT_BINARY;
  }
}

export const createCodexCliRunner = (
  options?: CodexCliRunnerOptions
): Runner => new CodexCliRunner(options);
