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
import { normalizeCamelCaseFlags } from '../utils/argv.js';
import {
  resolveWorkspaceConfig,
  workspaceFlags,
  type WorkspaceFlagValues
} from '../workspace/options.js';

export interface ParsedAgentRun {
  spec: RunSpec;
}

const agentRunFlags = {
  ...workspaceFlags,
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
      chunks.push(Buffer.from(chunk, 'utf8'));
    } else if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk);
    } else if (chunk instanceof Uint8Array) {
      chunks.push(Buffer.from(chunk));
    } else {
      chunks.push(Buffer.from(String(chunk), 'utf8'));
    }
  }

  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text.length > 0 ? text : undefined;
};

export const resolvePrompt = async (argPrompt?: string): Promise<string> => {
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

export const resolveRepo = (candidate?: string): string => {
  if (!candidate || candidate.trim().length === 0) {
    return process.cwd();
  }
  return candidate;
};

export const parseAgentRun = async (argv: string[]): Promise<ParsedAgentRun> => {
  const normalizedArgv = normalizeCamelCaseFlags(argv, Object.keys(agentRunFlags));
  const parsed = await Parser.parse(normalizedArgv, {
    flags: agentRunFlags,
    args: agentRunArgs,
    strict: true
  });

  const prompt = await resolvePrompt(parsed.args.prompt);
  const engine = resolveEngine(parsed.flags.engine);
  const repo = resolveRepo(parsed.flags.repo);
  const resumeId = parsed.flags.resume;
  const trimmedResumeId = resumeId?.trim();
  const workspace = resolveWorkspaceConfig(parsed.flags as WorkspaceFlagValues);

  return {
    spec: buildRunSpec(prompt, {
      engine,
      repo,
      resumeId: trimmedResumeId && trimmedResumeId.length > 0 ? trimmedResumeId : undefined,
      workspace
    })
  };
};

export const renderRunnerEvent = (
  event: RunnerEvent,
  streams: CliStreams,
  options: { prefix?: string } = {}
) => {
  const prefix = options.prefix ? `[${options.prefix}] ` : '';
  const writeStdout = (message: string) => writeLine(streams.stdout, `${prefix}${message}`);
  const writeStderr = (message: string) => writeLine(streams.stderr, `${prefix}${message}`);
  const formatLog = (value: unknown): string =>
    typeof value === 'string' ? value : JSON.stringify(value);

  switch (event.type) {
    case 'log':
      if (event.channel === 'stdout') {
        writeStdout(formatLog(event.data));
        break;
      }
      if (event.channel && event.channel !== 'stderr') {
        writeStderr(`[${event.channel}] ${formatLog(event.data)}`);
        break;
      }
      writeStderr(formatLog(event.data));
      break;
    case 'message': {
      const prefix =
        event.role === 'assistant'
          ? ''
          : event.role === 'tool'
            ? '[tool] '
            : '[system] ';
      writeStdout(`${prefix}${event.content}`);
      break;
    }
    case 'diff':
      event.files.forEach((file) => {
        writeStdout(`diff -- ${file.path}`);
        if (file.patch.trim().length > 0) {
          writeStdout(file.patch);
        }
      });
      break;
    case 'tool-call':
      writeStderr(`Tool call: ${event.call.name} ${JSON.stringify(event.call.arguments)}`);
      break;
    case 'flow-summary': {
      const { runs, success_rate: successRate, errors, avg_latency_ms: avgLatency } = event.summary;
      const successPercent = Number.isFinite(successRate) ? (successRate * 100).toFixed(1) : '0.0';
      writeStdout(
        `Flow summary: runs=${runs} success=${successPercent}% errors=${errors.total} avg_latency_ms=${Math.round(
          avgLatency
        )}`
      );
      break;
    }
    case 'error':
      writeStderr(`Error: ${event.error.message}`);
      if (event.error.details) {
        writeStderr(JSON.stringify(event.error.details, undefined, 2));
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
      writeStderr(`Run completed${summary}`);
      break;
    }
    default:
      writeStderr(formatLog(event));
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
