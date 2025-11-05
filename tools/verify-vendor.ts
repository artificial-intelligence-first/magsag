import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type VendoredFile = {
  relativePath: string;
  digest: string;
};

type DirectoryRule = {
  relativePath: string;
  allowedExtensions: Set<string>;
};

const ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..');

const VENDORED_FILES: VendoredFile[] = [
  {
    relativePath: 'catalog/contracts/agent.schema.json',
    digest: '52ffe35c1e09cd9d698770cfe17615caf4589333cc48f9ad296aeb1d8e697636'
  },
  {
    relativePath: 'catalog/contracts/offer_packet.schema.json',
    digest: '8ce20be235f1f05c27cea9d8dbc765b7afcf645071aa096b4331033b1adeb74a'
  },
  {
    relativePath: 'catalog/policies/flow_governance.yaml',
    digest: 'e1d1db8af41cdc3cf913538551d42af6b07e809b7c814bce40c223fd76a12b06'
  }
];

const DIRECTORY_RULES: DirectoryRule[] = [
  {
    relativePath: 'tools/adk/servers',
    allowedExtensions: new Set(['.yaml', '.yml'])
  },
  {
    relativePath: 'catalog/tools',
    allowedExtensions: new Set(['.json'])
  }
];

const hashFile = async (absolutePath: string): Promise<string> => {
  const content = await readFile(absolutePath);
  return createHash('sha256').update(content).digest('hex');
};

const verifyVendoredFiles = async (): Promise<string[]> => {
  const errors: string[] = [];
  for (const item of VENDORED_FILES) {
    const absolute = path.join(ROOT, item.relativePath);
    try {
      const digest = await hashFile(absolute);
      if (digest !== item.digest) {
        errors.push(
          `ERROR: ${item.relativePath} has digest ${digest}; expected ${item.digest}`
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`ERROR: Unable to read ${item.relativePath}: ${message}`);
    }
  }
  return errors;
};

const verifyDirectoryRules = async (): Promise<string[]> => {
  const errors: string[] = [];
  for (const rule of DIRECTORY_RULES) {
    const absolute = path.join(ROOT, rule.relativePath);
    try {
      const stats = await stat(absolute);
      if (!stats.isDirectory()) {
        errors.push(`ERROR: ${rule.relativePath} is not a directory`);
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`ERROR: Missing required directory ${rule.relativePath}: ${message}`);
      continue;
    }
    const stack: string[] = [absolute];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      const entries = await readdir(current, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }
        const extension = path.extname(entry.name);
        if (!rule.allowedExtensions.has(extension)) {
          const allowed = Array.from(rule.allowedExtensions.values()).join(', ') || '<none>';
          errors.push(
            `ERROR: Unexpected artefact ${path.relative(ROOT, entryPath)} (allowed: ${allowed})`
          );
        }
      }
    }
  }
  return errors;
};

const main = async (): Promise<void> => {
  const errors = [
    ...(await verifyVendoredFiles()),
    ...(await verifyDirectoryRules())
  ];

  if (errors.length > 0) {
    for (const message of errors) {
      console.error(message);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Vendor verification passed.');
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
