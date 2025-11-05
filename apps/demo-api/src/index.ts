import { createServer } from 'node:http';
import {
  loadMcpSummaries,
  loadPlanSummary
} from '@magsag/demo-shared';

type HttpResult = {
  statusCode: number;
  headers?: Record<string, string>;
  body: unknown;
};


const respondJson = (
  res: import('node:http').ServerResponse,
  result: HttpResult
): void => {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    ...(result.headers ?? {})
  };
  res.writeHead(result.statusCode, headers);
  res.end(JSON.stringify(result.body, null, 2));
};

const router = async (req: import('node:http').IncomingMessage): Promise<HttpResult> => {
  if (req.method !== 'GET') {
    return {
      statusCode: 405,
      headers: { Allow: 'GET' },
      body: { error: 'Method Not Allowed' }
    };
  }

  const url = req.url ?? '/';

  switch (url) {
    case '/':
      return {
        statusCode: 200,
        body: {
          message: 'MAGSAG demo API',
          endpoints: ['/health', '/plan', '/mcp']
        }
      };
    case '/health':
      return {
        statusCode: 200,
        body: { status: 'ok', timestamp: new Date().toISOString() }
      };
    case '/plan':
      return {
        statusCode: 200,
        body: await loadPlanSummary()
      };
    case '/mcp':
      return {
        statusCode: 200,
        body: { servers: await loadMcpSummaries() }
      };
    default:
      return {
        statusCode: 404,
        body: { error: 'Not Found' }
      };
  }
};

const PORT = Number.parseInt(process.env.DEMO_API_PORT ?? '3333', 10);

const server = createServer(async (req, res) => {
  try {
    const result = await router(req);
    respondJson(res, result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unexpected error occurred.';
    respondJson(res, {
      statusCode: 500,
      body: { error: message }
    });
  }
});

server.listen(PORT, () => {
  console.log(`Demo API listening on http://localhost:${PORT}`);
});
