import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { flowSummarySchema, runSpecSchema, runnerEventSchema } from '@magsag/schema';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(currentDir, '..');
const distDir = resolve(packageRoot, 'dist');

const packageJsonRaw = await readFile(resolve(packageRoot, 'package.json'), 'utf8');
const packageJson = JSON.parse(packageJsonRaw);
const packageVersion = typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';

const runSpecJson = zodToJsonSchema(runSpecSchema, 'RunSpec');
const runnerEventJson = zodToJsonSchema(runnerEventSchema, 'RunnerEvent');
const flowSummaryJson = zodToJsonSchema(flowSummarySchema, 'FlowSummary');

const openapiDocument = {
  openapi: '3.1.0',
  info: {
    title: '@magsag/server API',
    version: packageVersion,
    description: 'REST and streaming endpoints for MAGSAG agent execution.'
  },
  servers: [
    {
      url: '/',
      description: 'Relative to deployment host'
    }
  ],
  paths: {
    '/api/v1/agent/run': {
      post: {
        summary: 'Execute an agent run and stream RunnerEvent payloads.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RunSpec' }
            }
          }
        },
        responses: {
          '200': {
            description: 'SSE stream of RunnerEvent payloads.',
            content: {
              'text/event-stream': {
                schema: {
                  type: 'string',
                  description: 'Server-sent events containing RunnerEvent JSON payloads.'
                }
              }
            }
          },
          '400': {
            description: 'Runner not registered for requested engine.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/observability/flow-summary': {
      get: {
        summary: 'Retrieve the latest aggregated flow summary metrics.',
        responses: {
          '200': {
            description: 'Aggregated flow summary.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/FlowSummary' }
              }
            }
          },
          '500': {
            description: 'The server failed to load observability data.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['message'],
                  properties: {
                    message: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    },
    '/api/v1/health': {
      get: {
        summary: 'Health probe endpoint.',
        responses: {
          '200': {
            description: 'Server is healthy.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['status'],
                  properties: {
                    status: { type: 'string', enum: ['ok'] }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  components: {
    schemas: {
      RunSpec: runSpecJson,
      RunnerEvent: runnerEventJson,
      FlowSummary: flowSummaryJson
    }
  }
};

await mkdir(distDir, { recursive: true });
await writeFile(resolve(distDir, 'openapi.json'), JSON.stringify(openapiDocument, null, 2), 'utf8');
