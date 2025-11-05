import { pathToFileURL } from 'node:url';
import { agentRunHandler, parseAgentRun } from './commands/agent-run.js';
import type { ParsedAgentRun } from './commands/agent-run.js';
import { agentPlanHandler, parseAgentPlan } from './commands/agent-plan.js';
import type { ParsedAgentPlan } from './commands/agent-plan.js';
import { agentExecHandler, parseAgentExec } from './commands/agent-exec.js';
import type { ParsedAgentExec } from './commands/agent-exec.js';
import { runsDescribeHandler, parseRunsDescribe } from './commands/runs-describe.js';
import type { ParsedRunsDescribe } from './commands/runs-describe.js';
import { flowAvailableHandler, parseFlowAvailable } from './commands/flow-available.js';
import type { ParsedFlowAvailable } from './commands/flow-available.js';
import { flowGateHandler, parseFlowGate } from './commands/flow-gate.js';
import type { ParsedFlowGate } from './commands/flow-gate.js';
import { flowRunHandler, parseFlowRun } from './commands/flow-run.js';
import type { ParsedFlowRun } from './commands/flow-run.js';
import { flowSummarizeHandler, parseFlowSummarize } from './commands/flow-summarize.js';
import type { ParsedFlowSummarize } from './commands/flow-summarize.js';
import { flowValidateHandler, parseFlowValidate } from './commands/flow-validate.js';
import type { ParsedFlowValidate } from './commands/flow-validate.js';
import { mcpDoctorHandler, parseMcpDoctor } from './commands/mcp-doctor.js';
import type { ParsedMcpDoctor } from './commands/mcp-doctor.js';
import { mcpLsHandler, parseMcpLs } from './commands/mcp-ls.js';
import type { ParsedMcpLs } from './commands/mcp-ls.js';
import { mcpSearchHandler, parseMcpSearch } from './commands/mcp-search.js';
import type { ParsedMcpSearch } from './commands/mcp-search.js';
import { mcpBrowseHandler, parseMcpBrowse } from './commands/mcp-browse.js';
import type { ParsedMcpBrowse } from './commands/mcp-browse.js';
import type { CliStreams } from './utils/streams.js';

interface CommandRegistration {
  id: string;
  summary: string;
  aliases?: string[];
  parse(argv: string[]): Promise<ParsedCommand>;
  execute(parsed: ParsedCommand, streams: CliStreams): Promise<number>;
}

type ParsedCommand =
  | { kind: 'agent:plan'; payload: ParsedAgentPlan }
  | { kind: 'agent:exec'; payload: ParsedAgentExec }
  | { kind: 'agent:run'; payload: ParsedAgentRun }
  | { kind: 'runs:describe'; payload: ParsedRunsDescribe }
  | { kind: 'flow:available'; payload: ParsedFlowAvailable }
  | { kind: 'flow:validate'; payload: ParsedFlowValidate }
  | { kind: 'flow:run'; payload: ParsedFlowRun }
  | { kind: 'flow:summarize'; payload: ParsedFlowSummarize }
  | { kind: 'flow:gate'; payload: ParsedFlowGate }
  | { kind: 'mcp:ls'; payload: ParsedMcpLs }
  | { kind: 'mcp:doctor'; payload: ParsedMcpDoctor }
  | { kind: 'mcp:search'; payload: ParsedMcpSearch }
  | { kind: 'mcp:browse'; payload: ParsedMcpBrowse };

const COMMANDS: CommandRegistration[] = [
  {
    id: 'agent:plan',
    summary: 'Generate a MAG/SAG execution plan for the provided prompt.',
    async parse(argv: string[]) {
      const payload = await parseAgentPlan(argv);
      return { kind: 'agent:plan', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'agent:plan') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return agentPlanHandler(parsed.payload, streams);
    }
  },
  {
    id: 'agent:exec',
    summary: 'Execute a MAG/SAG plan with configurable concurrency and providers.',
    async parse(argv: string[]) {
      const payload = await parseAgentExec(argv);
      return { kind: 'agent:exec', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'agent:exec') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return agentExecHandler(parsed.payload, streams);
    }
  },
  {
    id: 'agent:run',
    summary: 'Execute a MAG/SAG agent run with the selected engine.',
    aliases: ['agent'],
    async parse(argv: string[]) {
      const payload = await parseAgentRun(argv);
      return { kind: 'agent:run', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'agent:run') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return agentRunHandler(parsed.payload, streams);
    }
  },
  {
    id: 'runs:describe',
    summary: 'Describe a recorded run log and display aggregated results.',
    async parse(argv: string[]) {
      const payload = await parseRunsDescribe(argv);
      return { kind: 'runs:describe', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'runs:describe') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return runsDescribeHandler(parsed.payload, streams);
    }
  },
  {
    id: 'flow:available',
    summary: 'Check whether the Flow Runner CLI is available.',
    aliases: ['flow'],
    async parse(argv: string[]) {
      const payload = await parseFlowAvailable(argv);
      return { kind: 'flow:available', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'flow:available') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return flowAvailableHandler(parsed.payload, streams);
    }
  },
  {
    id: 'flow:validate',
    summary: 'Validate a flow definition using flowctl.',
    async parse(argv: string[]) {
      const payload = await parseFlowValidate(argv);
      return { kind: 'flow:validate', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'flow:validate') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return flowValidateHandler(parsed.payload, streams);
    }
  },
  {
    id: 'flow:run',
    summary: 'Execute a flow definition via flowctl.',
    async parse(argv: string[]) {
      const payload = await parseFlowRun(argv);
      return { kind: 'flow:run', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'flow:run') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return flowRunHandler(parsed.payload, streams);
    }
  },
  {
    id: 'flow:summarize',
    summary: 'Summarize Flow Runner artifacts into aggregated metrics.',
    async parse(argv: string[]) {
      const payload = await parseFlowSummarize(argv);
      return { kind: 'flow:summarize', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'flow:summarize') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return flowSummarizeHandler(parsed.payload, streams);
    }
  },
  {
    id: 'flow:gate',
    summary: 'Evaluate a flow summary against governance policy thresholds.',
    async parse(argv: string[]) {
      const payload = await parseFlowGate(argv);
      return { kind: 'flow:gate', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'flow:gate') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return flowGateHandler(parsed.payload, streams);
    }
  },
  {
    id: 'mcp:ls',
    summary: 'List configured MCP servers or enumerate tools for a preset.',
    aliases: ['mcp'],
    async parse(argv: string[]) {
      const payload = await parseMcpLs(argv);
      return { kind: 'mcp:ls', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'mcp:ls') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return mcpLsHandler(parsed.payload, streams);
    }
  },
  {
    id: 'mcp:doctor',
    summary: 'Diagnose connectivity to an MCP server with transport fallbacks.',
    async parse(argv: string[]) {
      const payload = await parseMcpDoctor(argv);
      return { kind: 'mcp:doctor', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'mcp:doctor') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return mcpDoctorHandler(parsed.payload, streams);
    }
  },
  {
    id: 'mcp:search',
    summary: 'Temporarily disabled placeholder for the retired MCP search command.',
    async parse(argv: string[]) {
      const payload = await parseMcpSearch(argv);
      return { kind: 'mcp:search', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'mcp:search') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return mcpSearchHandler(parsed.payload, streams);
    }
  },
  {
    id: 'mcp:browse',
    summary: 'Temporarily disabled placeholder for the retired MCP browse command.',
    async parse(argv: string[]) {
      const payload = await parseMcpBrowse(argv);
      return { kind: 'mcp:browse', payload };
    },
    execute(parsed, streams) {
      if (parsed.kind !== 'mcp:browse') {
        throw new Error(`Unexpected command kind: ${parsed.kind}`);
      }
      return mcpBrowseHandler(parsed.payload, streams);
    }
  }
];

const HELP_TEXT = `Usage
  magsag <command> [flags]

Commands
  agent plan         Generate a MAG/SAG execution plan.
  agent exec         Execute a plan with multi-SAG orchestration.
  agent run          Execute a MAG/SAG agent run.
  runs describe      Describe a recorded run log.
  flow available     Check Flow Runner CLI availability.
  flow validate      Validate a flow definition.
  flow run           Execute a flow via flowctl.
  flow summarize     Summarize Flow Runner artifacts.
  flow gate          Evaluate governance thresholds for a flow summary.
  mcp ls             Inspect MCP presets and list remote tools.
  mcp doctor         Diagnose MCP connectivity with fallback transports.

For detailed help on a command, pass --help after the command.`;

const normalizeArgs = (argv: string[]): string[] =>
  argv.map((arg) => arg.trim()).filter((arg) => arg.length > 0);

const isHelpRequest = (argv: string[]): boolean =>
  argv.includes('--help') || argv.includes('-h');

const resolveCommand = (
  argv: string[]
): { registration: CommandRegistration | undefined; rest: string[] } => {
  if (argv.length === 0) {
    return { registration: undefined, rest: [] };
  }

  const [first, second, ...rest] = argv;
  const explicitId = second ? `${first}:${second}` : first;

  const directMatch = COMMANDS.find((command) => command.id === explicitId);
  if (directMatch) {
    return { registration: directMatch, rest };
  }

  const aliasMatch = COMMANDS.find((command) => command.aliases?.includes(first) ?? false);
  if (aliasMatch) {
    if (second) {
      const derivedId = `${first}:${second}`;
      const derivedMatch = COMMANDS.find((command) => command.id === derivedId);
      if (derivedMatch) {
        return { registration: derivedMatch, rest };
      }
    }

    const [, expectedSubcommand] = aliasMatch.id.split(':');
    if (expectedSubcommand && second === expectedSubcommand) {
      return { registration: aliasMatch, rest };
    }

    const aliasRest = [second, ...rest].filter((token): token is string => Boolean(token));
    return { registration: aliasMatch, rest: aliasRest };
  }

  return { registration: undefined, rest: argv.slice(1) };
};

export const __test__ = { resolveCommand } as const;

const writeHelp = (streams: CliStreams) => {
  streams.stdout.write(`${HELP_TEXT}\n`);
};

const handleUnknownCommand = (streams: CliStreams, command?: string) => {
  if (command) {
    streams.stderr.write(`Unknown command: ${command}\n`);
  }
  writeHelp(streams);
};

export const runCli = async (
  argv: string[] = process.argv.slice(2),
  streams: CliStreams = { stdout: process.stdout, stderr: process.stderr }
): Promise<number> => {
  const normalized = normalizeArgs(argv);

  if (normalized.length === 0 || isHelpRequest(normalized)) {
    writeHelp(streams);
    return 0;
  }

  const { registration, rest } = resolveCommand(normalized);
  if (!registration) {
    handleUnknownCommand(streams, normalized[0]);
    return 1;
  }

  try {
    const parsed = await registration.parse(rest);
    return await registration.execute(parsed, streams);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown error';
    streams.stderr.write(`${message}\n`);
    return 1;
  }
};

const isDirectExecution = (): boolean => {
  if (typeof process === 'undefined' || typeof process.argv === 'undefined') {
    return false;
  }
  const executedScript = process.argv[1];
  if (!executedScript) {
    return false;
  }
  try {
    return pathToFileURL(executedScript).href === import.meta.url;
  } catch {
    return false;
  }
};

if (isDirectExecution()) {
  void runCli();
}
