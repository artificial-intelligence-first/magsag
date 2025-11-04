import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const distDir = resolve(packageRoot, 'dist');

const { createOpenApiDocument } = await import('../dist/index.js');

const openapiDocument = createOpenApiDocument();

await mkdir(distDir, { recursive: true });
await writeFile(resolve(distDir, 'openapi.json'), JSON.stringify(openapiDocument, null, 2), 'utf8');
