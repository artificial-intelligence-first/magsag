import { zodToJsonSchema } from 'zod-to-json-schema';
import { createRequire } from 'node:module';
import {
  flowSummarySchema,
  runSpecSchema,
  runnerEventSchema
} from '@magsag/schema';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version?: unknown };

const packageVersion =
  packageJson && typeof packageJson === 'object' && 'version' in packageJson
    ? String(packageJson.version ?? '0.0.0')
    : '0.0.0';

export const createOpenApiDocument = () => {
  const runSpecJson = zodToJsonSchema(runSpecSchema, 'RunSpec');
  const runnerEventJson = zodToJsonSchema(runnerEventSchema, 'RunnerEvent');
  const flowSummaryJson = zodToJsonSchema(flowSummarySchema, 'FlowSummary');

  return {
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
      '/api/v1/sessions': {
        get: {
          summary: 'List recorded sessions.',
          responses: {
            '200': {
              description: 'Collection of session summaries.',
              content: {
                'application/json': {
                  schema: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/SessionSummary' }
                  }
                }
              }
            }
          }
        }
      },
      '/api/v1/sessions/{id}': {
        get: {
          summary: 'Retrieve a session by identifier.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Session detail including events.',
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SessionRecord' }
                }
              }
            },
            '404': {
              description: 'Session could not be found.',
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
        },
        delete: {
          summary: 'Delete a recorded session.',
          parameters: [
            {
              in: 'path',
              name: 'id',
              required: true,
              schema: { type: 'string' }
            }
          ],
          responses: {
            '200': {
              description: 'Session removed successfully.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['id', 'status'],
                    properties: {
                      id: { type: 'string' },
                      status: { type: 'string', enum: ['deleted'] }
                    }
                  }
                }
              }
            },
            '404': {
              description: 'Session could not be found.',
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
      },
      '/openapi.json': {
        get: {
          summary: 'Retrieve the OpenAPI document.',
          responses: {
            '200': {
              description: 'OpenAPI document.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    additionalProperties: true
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
        FlowSummary: flowSummaryJson,
        SessionError: {
          type: 'object',
          required: ['message'],
          properties: {
            message: { type: 'string' },
            code: { type: 'string' },
            details: {
              type: 'object',
              additionalProperties: true
            }
          }
        },
        SessionSummary: {
          type: 'object',
          required: ['id', 'engine', 'prompt', 'repo', 'status', 'createdAt', 'updatedAt'],
          properties: {
            id: { type: 'string' },
            engine: { type: 'string' },
            prompt: { type: 'string' },
            repo: { type: 'string' },
            status: { type: 'string', enum: ['running', 'completed', 'failed'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            lastEventType: { type: 'string' },
            error: { $ref: '#/components/schemas/SessionError' }
          }
        },
        SessionRecord: {
          allOf: [
            { $ref: '#/components/schemas/SessionSummary' },
            {
              type: 'object',
              required: ['events', 'spec'],
              properties: {
                events: {
                  type: 'array',
                  items: { $ref: '#/components/schemas/RunnerEvent' }
                },
                spec: { $ref: '#/components/schemas/RunSpec' }
              }
            }
          ]
        }
      }
    }
  };
};
