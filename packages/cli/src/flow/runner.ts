import { promises as fs, constants as fsConstants } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execa } from 'execa';

const DEFAULT_BINARY = 'flowctl';

const WINDOWS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com'];

const currentDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(currentDir, '../../../..');

const candidateExtensions = (): string[] => {
  if (process.platform === 'win32') {
    return ['', ...WINDOWS_EXTENSIONS];
  }
  return [''];
};

const canExecute = async (filePath: string): Promise<boolean> => {
  try {
    await fs.access(filePath, fsConstants.X_OK);
    return true;
  } catch {
    if (process.platform === 'win32') {
      try {
        await fs.access(filePath, fsConstants.F_OK);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }
};

const findOnPath = async (binary: string): Promise<string | undefined> => {
  const pathEnv = process.env.PATH;
  if (!pathEnv) {
    return undefined;
  }

  const segments = pathEnv.split(process.platform === 'win32' ? ';' : ':').filter(Boolean);
  for (const segment of segments) {
    for (const ext of candidateExtensions()) {
      const candidate = join(segment, `${binary}${ext}`);
      if (await canExecute(candidate)) {
        return candidate;
      }
    }
  }
  return undefined;
};

const findRepoBinary = async (binary: string): Promise<string | undefined> => {
  const binPath = join(repoRoot, 'bin', binary);
  return (await canExecute(binPath)) ? binPath : undefined;
};

const mergePythonPath = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  const merged = { ...env };
  const custom = merged.FLOW_RUNNER_PYTHONPATH;
  if (custom) {
    const existing = merged.PYTHONPATH;
    merged.PYTHONPATH = existing ? `${custom}${pathDelimiter()}${existing}` : custom;
  }
  return merged;
};

const pathDelimiter = () => (process.platform === 'win32' ? ';' : ':');

const buildEnvironment = (env?: Record<string, string | undefined>) => {
  const baseEnv: NodeJS.ProcessEnv = { ...process.env };
  if (env) {
    for (const [key, value] of Object.entries(env)) {
      if (value === undefined) {
        delete baseEnv[key];
      } else {
        baseEnv[key] = value;
      }
    }
  }
  return mergePythonPath(baseEnv);
};

export interface FlowRunnerResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export interface FlowRunOptions {
  dryRun?: boolean;
  only?: string;
  continueFrom?: string;
  env?: Record<string, string | undefined>;
}

export interface FlowValidateOptions {
  schema?: string;
  env?: Record<string, string | undefined>;
}

export interface FlowRunnerInfo {
  name: string;
  binary: string;
  version?: string;
  capabilities: string[];
}

export class FlowRunner {
  private resolvedExecutable: string | null | undefined;

  constructor(private readonly binary = DEFAULT_BINARY) {}

  private async resolveExecutable(): Promise<string | undefined> {
    if (this.resolvedExecutable !== undefined) {
      return this.resolvedExecutable ?? undefined;
    }

    const fromPath = await findOnPath(this.binary);
    if (fromPath) {
      this.resolvedExecutable = fromPath;
      return fromPath;
    }

    const repoBinary = await findRepoBinary(this.binary);
    if (repoBinary) {
      this.resolvedExecutable = repoBinary;
      return repoBinary;
    }

    this.resolvedExecutable = null;
    return undefined;
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(await this.resolveExecutable());
  }

  async info(): Promise<FlowRunnerInfo | undefined> {
    const executable = await this.resolveExecutable();
    if (!executable) {
      return undefined;
    }

    try {
      const { stdout } = await execa(executable, ['--version'], {
        env: buildEnvironment(),
        reject: false
      });
      const version = stdout.trim() || undefined;
      return {
        name: 'flow-runner',
        binary: executable,
        version,
        capabilities: ['dry-run', 'artifacts']
      };
    } catch {
      return {
        name: 'flow-runner',
        binary: executable,
        capabilities: ['dry-run', 'artifacts']
      };
    }
  }

  async validate(flowPath: string, options: FlowValidateOptions = {}): Promise<FlowRunnerResult> {
    const executable = await this.resolveExecutable();
    if (!executable) {
      return {
        ok: false,
        stdout: '',
        stderr: 'flowctl is not installed. See Flow Runner setup instructions.'
      };
    }

    const args = options.schema
      ? ['validate', flowPath, '--schema', options.schema]
      : ['run', flowPath, '--dry-run'];

    const { exitCode, stdout, stderr } = await execa(executable, args, {
      env: buildEnvironment(options.env),
      reject: false
    });

    return {
      ok: exitCode === 0,
      stdout,
      stderr
    };
  }

  async run(flowPath: string, options: FlowRunOptions = {}): Promise<FlowRunnerResult> {
    const executable = await this.resolveExecutable();
    if (!executable) {
      return {
        ok: false,
        stdout: '',
        stderr: 'flowctl is not installed. See Flow Runner setup instructions.'
      };
    }

    const args = ['run', flowPath];
    if (options.dryRun) {
      args.push('--dry-run');
    }
    if (options.only) {
      args.push('--only', options.only);
    }
    if (options.continueFrom) {
      args.push('--continue-from', options.continueFrom);
    }

    const { exitCode, stdout, stderr } = await execa(executable, args, {
      env: buildEnvironment(options.env),
      reject: false
    });

    return {
      ok: exitCode === 0,
      stdout,
      stderr
    };
  }
}
