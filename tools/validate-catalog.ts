import { readdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');
const CATALOG_ROOT = path.join(ROOT, 'catalog');

const errors: string[] = [];

const walk = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const resolved = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return walk(resolved);
      }
      return [resolved];
    })
  );
  return files.flat();
};

const validateYaml = async (file: string): Promise<void> => {
  try {
    const raw = await readFile(file, 'utf8');
    parseYaml(raw);
  } catch (error) {
    errors.push(`Invalid YAML in ${path.relative(ROOT, file)}: ${(error as Error).message}`);
  }
};

const validateJsonSchema = async (file: string): Promise<void> => {
  try {
    const raw = await readFile(file, 'utf8');
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data.$schema !== 'string' || data.$schema.length === 0) {
      errors.push(`Missing $schema in ${path.relative(ROOT, file)}`);
    }
  } catch (error) {
    errors.push(`Invalid JSON Schema in ${path.relative(ROOT, file)}: ${(error as Error).message}`);
  }
};

const ensureCatalogExists = async (): Promise<void> => {
  try {
    const stats = await stat(CATALOG_ROOT);
    if (!stats.isDirectory()) {
      throw new Error('catalog path is not a directory');
    }
  } catch (error) {
    errors.push(`Catalog directory missing: ${CATALOG_ROOT} (${(error as Error).message})`);
  }
};

const main = async (): Promise<void> => {
  await ensureCatalogExists();
  if (errors.length > 0) {
    for (const message of errors) {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  const files = await walk(CATALOG_ROOT);
  await Promise.all(
    files.map(async (file) => {
      if (file.endsWith('.yaml') || file.endsWith('.yml')) {
        await validateYaml(file);
      } else if (file.endsWith('.schema.json')) {
        await validateJsonSchema(file);
      }
    })
  );

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  console.log('✓ Catalog validation passed');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
