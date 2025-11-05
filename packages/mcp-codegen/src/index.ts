#!/usr/bin/env node
import { mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { generateModules, loadServerSpecs, type ModuleFile } from './codegen.js';

interface CliOptions {
  check: boolean;
  rootDir: string;
  serversDir: string;
  outputDir: string;
}

const parseArgs = (argv: string[], rootDir: string): CliOptions => {
  const check = argv.includes('--check');
  const serversDir = path.resolve(rootDir, 'tools/adk/servers');
  const outputDir = path.resolve(rootDir, 'servers');
  return { check, rootDir, serversDir, outputDir };
};

const readExistingFile = async (filePath: string): Promise<string | null> => {
  try {
    const content = await readFile(filePath, 'utf8');
    return content;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const ensureDirectory = async (dirPath: string): Promise<void> => {
  await mkdir(dirPath, { recursive: true });
};

const listTypeScriptFiles = async (dirPath: string): Promise<string[]> => {
  let entries: string[];
  try {
    entries = await readdir(dirPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(dirPath, entry);
    const info = await stat(absolute);
    if (info.isDirectory()) {
      const nested = await listTypeScriptFiles(absolute);
      for (const child of nested) {
        files.push(path.join(entry, child));
      }
      continue;
    }
    if (entry.endsWith('.ts')) {
      files.push(entry);
    }
  }
  return files;
};

const writeModule = async (outputDir: string, file: ModuleFile): Promise<void> => {
  const target = path.join(outputDir, file.filePath);
  await ensureDirectory(path.dirname(target));
  await writeFile(target, file.contents, 'utf8');
};

const removeFile = async (outputDir: string, relativePath: string): Promise<void> => {
  const target = path.join(outputDir, relativePath);
  await rm(target, { force: true });
};

const run = async (argv: string[], cwd: string) => {
  const options = parseArgs(argv, cwd);
  const specs = await loadServerSpecs(options.serversDir);
  const generated = generateModules({ specs });
  const generatedPaths = new Set(generated.map((file) => path.normalize(file.filePath)));

  if (options.check) {
    const existingFiles = await listTypeScriptFiles(options.outputDir);
    const normalizedExisting = new Set(existingFiles.map((file) => path.normalize(file)));
    const diffs: string[] = [];

    for (const file of generated) {
      const existing = await readExistingFile(path.join(options.outputDir, file.filePath));
      if (existing === null) {
        diffs.push(`Missing file: ${file.filePath}`);
        continue;
      }
      if (existing !== file.contents) {
        diffs.push(`Outdated file: ${file.filePath}`);
      }
    }

    for (const file of normalizedExisting) {
      if (!generatedPaths.has(file)) {
        diffs.push(`Extra file: ${file}`);
      }
    }

    if (diffs.length > 0) {
      for (const diff of diffs) {
        process.stderr.write(`${diff}\n`);
      }
      process.exitCode = 1;
      return;
    }

    process.stdout.write('mcp:codegen --check passed (no changes needed)\n');
    return;
  }

  await ensureDirectory(options.outputDir);
  for (const file of generated) {
    await writeModule(options.outputDir, file);
  }

  const existingFiles = await listTypeScriptFiles(options.outputDir);
  for (const relativePath of existingFiles) {
    const normalized = path.normalize(relativePath);
    if (!generatedPaths.has(normalized)) {
      await removeFile(options.outputDir, relativePath);
    }
  }

  process.stdout.write(`Generated ${generated.length} files in ${path.relative(cwd, options.outputDir) || '.'}\n`);
};

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  run(process.argv.slice(2), process.cwd()).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}

export const __test__ = {
  parseArgs,
  listTypeScriptFiles,
  readExistingFile
};
