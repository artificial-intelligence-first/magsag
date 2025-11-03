import { Args, Flags, Parser } from '@oclif/core';
import {
  ENGINE_IDS,
  type EngineId,
  type RunSpec,
  type RunnerEvent
} from '@magsag/core';
import { buildRunSpec } from '../run-spec.js';
import { getDefaultRunnerRegistry } from '../registry.js';
import { type CliStreams, writeLine } from '../utils/streams.js';

export interface ParsedAgentRun {
  spec: RunSpec;
}

const agentRunFlags = {
  repo: Flags.string({
    char: 'r',
    summary: 'Repository passed to the engine',
    description: 'Absolute or relative path to the repository root (defaults to CWD).'
  }),
  engine: Flags.string({
    char: 'e',
    summary: 'Engine ID to execute with',
    description: 'Selects which runner to invoke.',
    options: [...ENGINE_IDS]
  }),
  resume: Flags.string({
    summary: 'Resume an existing session by ID',
    description: 'Passes the resume identifier through to the engine.'
  })
};

const agentRunArgs = {
  prompt: Args.string({
    name: 'prompt',
    description: 'Prompt or task description for the run.',
    required: false
  })
};

const isEngineId = (value: string | undefined): value is EngineId =>
  typeof value === 'string' && (ENGINE_IDS as readonly string[]).includes(value);

const readPromptFromStdin = async (): Promise<string | undefined> => {
  if (process.stdin.isTTY) {
    return undefined;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    if (typeof chunk === 'string') {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(chunk);
    }
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text.length > 0 ? text : undefined;
};

const resolvePrompt = async (argPrompt?: string): Promise<string> => {
  if (argPrompt && argPrompt.trim().length > 0) {
    return argPrompt;
  }

  const stdinPrompt = await readPromptFromStdin();
  if (stdinPrompt) {
    return stdinPrompt;
  }

  throw new Error('Prompt is required. Provide it as an argument or via stdin.');
};

const resolveEngine = (candidate?: string): EngineId => {
  if (!candidate) {
    return 'codex-cli';
  }
  if (!isEngineId(candidate)) {
    throw new Error(
      `Invalid engine '${candidate}'. Supported engines: ${ENGINE_IDS.join(', ')}`
    );
  }
  return candidate;
};

const resolveRepo = (candidate?: string): string => {
  if (!candidate || candidate.trim().length === 0) {
    return process.cwd();
  }
  return candidate;
};

export const parseAgentRun = async (argv: string[]): Promise<ParsedAgentRun> => {
  const parsed = await Parser.parse(argv, {
    flags: agentRunFlags,
    args: agentRunArgs,
    strict: true
  });

  const prompt = await resolvePrompt(parsed.args.prompt);
  const engine = resolveEngine(parsed.flags.engine);
  const repo = resolveRepo(parsed.flags.repo);
  const resumeId = parsed.flags.resume;

  return {
    spec: buildRunSpec(prompt, {
      engine,
      repo,
      resumeId: resumeId?.trim() || undefined
    })
  };
};

const renderRunnerEvent = (
  event: RunnerEvent,
  streams: CliStreams
) => {
  switch (event.type) {
    case 'log':
      writeLine(streams.stderr, event.data);
      break;
    case 'message': {
      const prefix =
        event.role === 'assistant'
          ? ''
          : event.role === 'tool'
            ? '[tool] '
            : '[system] ';
      writeLine(streams.stdout, `${prefix}${event.content}`);
      break;
    }
    case 'diff':
      event.files.forEach((file) => {
        writeLine(streams.stdout, `diff -- ${file.path}`);
        if (file.patch.trim().length > 0) {
          writeLine(streams.stdout, file.patch);
        }
      });
      break;
    case 'tool-call':
      writeLine(
        streams.stderr,
        `Tool call: ${event.call.name} ${JSON.stringify(event.call.arguments)}`
      );
      break;
    case 'error':
      writeLine(streams.stderr, `Error: ${event.error.message}`);
      if (event.error.details) {
        writeLine(streams.stderr, JSON.stringify(event.error.details, undefined, 2));
      }
      break;
    case 'done': {
      const summaryParts: string[] = [];
      if (event.sessionId) {
        summaryParts.push(`session=${event.sessionId}`);
      }
      if (event.stats) {
        summaryParts.push(`stats=${JSON.stringify(event.stats)}`);
      }
      const summary = summaryParts.length > 0 ? ` (${summaryParts.join(', ')})` : '';
      writeLine(streams.stderr, `Run completed${summary}`);
      break;
    }
    default:
      writeLine(streams.stderr, `Unhandled event: ${JSON.stringify(event)}`);
      break;
  }
};

export const agentRunHandler = async (
  parsed: ParsedAgentRun,
  streams: CliStreams
): Promise<number> => {
  const registry = getDefaultRunnerRegistry();
  const factory = registry.get(parsed.spec.engine);
  if (!factory) {
    writeLine(
      streams.stderr,
      `Runner not registered for engine '${parsed.spec.engine}'.`
    );
    return 1;
  }

  const runner = factory.create();
  let exitCode = 0;

  try {
    for await (const event of runner.run(parsed.spec)) {
      renderRunnerEvent(event, streams);
      if (event.type === 'error') {
        exitCode = exitCode === 0 ? 1 : exitCode;
      }
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    writeLine(streams.stderr, message);
    return 1;
  }

  return exitCode;
};
