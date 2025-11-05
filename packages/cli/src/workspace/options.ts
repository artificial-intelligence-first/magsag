import { Flags } from '@oclif/core';
import type { WorkspaceConfig, WorkspaceLogChannel } from '@magsag/core';

export const workspaceFlags = {
  workspaceBase: Flags.string({
    summary: 'Override the root directory for execution workspaces.',
    description: 'Defaults to $TMPDIR/magsag-workspaces when omitted.'
  }),
  workspaceName: Flags.string({
    summary: 'Assign a human-readable name to the workspace folder.'
  }),
  workspaceKeep: Flags.boolean({
    summary: 'Keep the workspace after completion instead of cleaning it up.'
  }),
  workspaceMemory: Flags.integer({
    summary: 'Maximum heap usage for the workspace process in megabytes.',
    description: 'Set 0 to disable the limit. Defaults to environment configuration.'
  }),
  workspaceCpu: Flags.integer({
    summary: 'Total CPU time budget for the workspace process in milliseconds.'
  }),
  workspaceTimeout: Flags.integer({
    summary: 'Wall-clock timeout in milliseconds for the workspace process.'
  }),
  workspaceChannels: Flags.string({
    summary: 'Comma-separated list of workspace log channels to surface.',
    description: 'Supported channels: workspace,stdout,stderr.'
  })
} as const;

export interface WorkspaceFlagValues {
  workspaceBase?: string;
  workspaceName?: string;
  workspaceKeep?: boolean;
  workspaceMemory?: number;
  workspaceCpu?: number;
  workspaceTimeout?: number;
  workspaceChannels?: string;
}

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }
  return undefined;
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseChannels = (value: string | undefined): WorkspaceLogChannel[] | undefined => {
  if (!value) {
    return undefined;
  }
  const normalized = value
    .split(',')
    .map((token) => token.trim().toLowerCase())
    .filter((token) => token.length > 0) as WorkspaceLogChannel[];

  const allowed: WorkspaceLogChannel[] = ['workspace', 'stdout', 'stderr'];
  return normalized.filter((channel) => (allowed as string[]).includes(channel));
};

export const resolveWorkspaceConfig = (
  flags: WorkspaceFlagValues,
  env: NodeJS.ProcessEnv = process.env
): WorkspaceConfig | undefined => {
  const base = flags.workspaceBase ?? env.MAGSAG_WORKSPACE_BASE;
  const name = flags.workspaceName ?? env.MAGSAG_WORKSPACE_NAME;
  const keep = flags.workspaceKeep ?? parseBoolean(env.MAGSAG_WORKSPACE_KEEP);
  const envMemory = parseNumber(env.MAGSAG_WORKSPACE_MEMORY_MB);
  const envCpu = parseNumber(env.MAGSAG_WORKSPACE_CPU_MS);
  const envTimeout = parseNumber(env.MAGSAG_WORKSPACE_WALLCLOCK_MS);

  const memoryMb =
    typeof flags.workspaceMemory === 'number'
      ? flags.workspaceMemory > 0
        ? flags.workspaceMemory
        : undefined
      : typeof envMemory === 'number' && envMemory > 0
        ? envMemory
        : undefined;
  const cpuMs =
    typeof flags.workspaceCpu === 'number'
      ? flags.workspaceCpu > 0
        ? flags.workspaceCpu
        : undefined
      : typeof envCpu === 'number' && envCpu > 0
        ? envCpu
        : undefined;
  const wallClockMs =
    typeof flags.workspaceTimeout === 'number'
      ? flags.workspaceTimeout > 0
        ? flags.workspaceTimeout
        : undefined
      : typeof envTimeout === 'number' && envTimeout > 0
        ? envTimeout
        : undefined;
  const channels =
    parseChannels(flags.workspaceChannels) ?? parseChannels(env.MAGSAG_WORKSPACE_CHANNELS);

  const config: WorkspaceConfig = {};
  if (base) {
    config.baseDir = base;
  }
  if (name) {
    config.name = name;
  }
  if (typeof keep === 'boolean') {
    config.keep = keep;
  }
  const limits: WorkspaceConfig['limits'] = {};
  if (typeof memoryMb === 'number' && memoryMb > 0) {
    limits.memoryMb = memoryMb;
  }
  if (typeof cpuMs === 'number' && cpuMs > 0) {
    limits.cpuMs = cpuMs;
  }
  if (typeof wallClockMs === 'number' && wallClockMs > 0) {
    limits.wallClockMs = wallClockMs;
  }
  if (limits.cpuMs || limits.memoryMb || limits.wallClockMs) {
    config.limits = limits;
  }
  if (channels && channels.length > 0) {
    config.logChannels = channels;
  }

  if (Object.keys(config).length === 0) {
    return undefined;
  }
  return config;
};
