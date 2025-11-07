import type { Context } from 'hono';
import type { IncomingMessage } from 'http';

const DEFAULT_DEV_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
];

export interface AgentCorsOptions {
  enabled?: boolean;
  allowedOrigins?: string[];
  allowCredentials?: boolean;
  allowHeaders?: string[];
  allowMethods?: string[];
}

export interface AgentRateLimitOptions {
  enabled?: boolean;
  requestsPerSecond?: number;
  burst?: number;
  trustForwardedHeaders?: boolean;
}

export interface AgentSecurityOptions {
  cors?: AgentCorsOptions;
  rateLimit?: AgentRateLimitOptions;
}

export interface CorsRuntimeConfig {
  enabled: boolean;
  allowedOrigins: string[];
  allowCredentials: boolean;
  allowHeaders: string[];
  allowMethods: string[];
}

export interface RateLimitRuntimeConfig {
  enabled: boolean;
  requestsPerSecond: number;
  burst: number;
  trustForwardedHeaders: boolean;
}

export interface SecurityRuntime {
  cors: CorsRuntimeConfig;
  rateLimit: RateLimitRuntimeConfig;
}

const parseList = (value: string | undefined): string[] =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0) ?? [];

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {
    return true;
  }
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {
    return false;
  }
  return fallback;
};

const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/$/, '').toLowerCase();

export const createSecurityRuntime = (
  options?: AgentSecurityOptions,
  env: NodeJS.ProcessEnv = process.env
): SecurityRuntime => {
  const nodeEnv = env.NODE_ENV?.toLowerCase() ?? 'development';
  const isProduction = nodeEnv === 'production';
  const envOrigins = parseList(env.MAGSAG_CORS_ORIGINS);
  const allowedOrigins =
    envOrigins.length > 0
      ? envOrigins
      : isProduction
        ? []
        : DEFAULT_DEV_ORIGINS;
  const allowListConfigured = allowedOrigins.length > 0;

  const corsRuntime: CorsRuntimeConfig = {
    enabled: allowListConfigured,
    allowedOrigins,
    allowCredentials: parseBoolean(env.MAGSAG_CORS_ALLOW_CREDENTIALS, true),
    allowHeaders: ['content-type', 'authorization'],
    allowMethods: ['GET', 'POST', 'DELETE', 'OPTIONS']
  };

  if (options?.cors?.allowedOrigins) {
    corsRuntime.allowedOrigins = options.cors.allowedOrigins.map(normalizeOrigin);
    corsRuntime.enabled = corsRuntime.allowedOrigins.length > 0;
  }
  if (options?.cors?.allowCredentials !== undefined) {
    corsRuntime.allowCredentials = options.cors.allowCredentials;
  }
  if (options?.cors?.allowHeaders) {
    corsRuntime.allowHeaders = options.cors.allowHeaders.map((header) => header.toLowerCase());
  }
  if (options?.cors?.allowMethods) {
    corsRuntime.allowMethods = options.cors.allowMethods.map((method) => method.toUpperCase());
  }
  if (options?.cors?.enabled !== undefined) {
    corsRuntime.enabled = options.cors.enabled;
  }

  corsRuntime.allowedOrigins = corsRuntime.allowedOrigins.map(normalizeOrigin);

  const envRateLimitQps = parseNumber(
    env.MAGSAG_RATE_LIMIT_QPS,
    isProduction ? 10 : 25
  );
  const envBurst = parseNumber(
    env.MAGSAG_RATE_LIMIT_BURST,
    isProduction ? Math.max(envRateLimitQps * 3, envRateLimitQps) : envRateLimitQps * 5
  );

  const rateLimitRuntime: RateLimitRuntimeConfig = {
    enabled: parseBoolean(env.MAGSAG_RATE_LIMIT_ENABLED, isProduction),
    requestsPerSecond: envRateLimitQps,
    burst: envBurst,
    trustForwardedHeaders: parseBoolean(env.MAGSAG_RATE_LIMIT_TRUST_PROXY, false)
  };

  if (options?.rateLimit?.requestsPerSecond) {
    rateLimitRuntime.requestsPerSecond = options.rateLimit.requestsPerSecond;
  }
  if (options?.rateLimit?.burst) {
    rateLimitRuntime.burst = options.rateLimit.burst;
  }
  if (options?.rateLimit?.enabled !== undefined) {
    rateLimitRuntime.enabled = options.rateLimit.enabled;
  }
  if (options?.rateLimit?.trustForwardedHeaders !== undefined) {
    rateLimitRuntime.trustForwardedHeaders = options.rateLimit.trustForwardedHeaders;
  }

  if (rateLimitRuntime.requestsPerSecond <= 0 || rateLimitRuntime.burst <= 0) {
    rateLimitRuntime.enabled = false;
  }

  return {
    cors: corsRuntime,
    rateLimit: rateLimitRuntime
  };
};

interface RateLimitState {
  tokens: number;
  lastRefill: number;
}

export interface RateLimitConsumption {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(identifier: string | undefined): RateLimitConsumption;
}

const createTokenBucketLimiter = (
  config: RateLimitRuntimeConfig
): RateLimiter | null => {
  if (!config.enabled) {
    return null;
  }

  const store = new Map<string, RateLimitState>();
  const burst = Math.max(1, config.burst);
  const refillRate = Math.max(0.001, config.requestsPerSecond);

  return {
    consume(identifier: string | undefined): RateLimitConsumption {
      const key = identifier?.toString() ?? 'anonymous';
      const now = Date.now();
      const previous = store.get(key) ?? { tokens: burst, lastRefill: now };
      const elapsedMs = now - previous.lastRefill;
      const refillTokens = (elapsedMs / 1000) * refillRate;
      const nextTokens = Math.min(burst, previous.tokens + refillTokens);
      if (nextTokens < 1) {
        previous.tokens = nextTokens;
        previous.lastRefill = now;
        store.set(key, previous);
        return {
          allowed: false,
          remaining: 0,
          retryAfterSeconds: 1
        };
      }

      const updatedTokens = nextTokens - 1;
      store.set(key, {
        tokens: updatedTokens,
        lastRefill: now
      });

      return {
        allowed: true,
        remaining: Math.max(0, Math.floor(updatedTokens)),
        retryAfterSeconds: 0
      };
    }
  };
};

export const createRateLimiter = (
  config: RateLimitRuntimeConfig
): RateLimiter | null => createTokenBucketLimiter(config);

export type RateLimitGuard = (context: Context) => Response | null;

const resolveRemoteAddress = (context: Context): string | undefined => {
  const honoHeader = context.req.raw.headers.get('x-hono-remote-address');
  if (honoHeader && honoHeader.length > 0) {
    return honoHeader;
  }

  const incoming = (context.env as { incoming?: IncomingMessage } | undefined)?.incoming;
  if (incoming?.socket?.remoteAddress) {
    return incoming.socket.remoteAddress;
  }
  // Older Node versions expose connection instead of socket
  const connection = (incoming as { connection?: { remoteAddress?: string } } | undefined)?.connection;
  if (connection?.remoteAddress) {
    return connection.remoteAddress;
  }
  return undefined;
};

export const createRateLimitGuard = (
  config: RateLimitRuntimeConfig,
  limiter = createRateLimiter(config)
): RateLimitGuard | null => {
  if (!config.enabled || !limiter) {
    return null;
  }

  return (context: Context): Response | null => {
    const rawHeaders = context.req.raw.headers;
    let identifier = resolveRemoteAddress(context);

    if (config.trustForwardedHeaders) {
      identifier =
        rawHeaders.get('x-client-ip') ??
        rawHeaders.get('true-client-ip') ??
        rawHeaders.get('fly-client-ip') ??
        rawHeaders.get('fastly-client-ip') ??
        identifier;

      if (!identifier) {
        const forwardedFor = context.req.header('x-forwarded-for');
        identifier = forwardedFor?.split(',')[0]?.trim();
      }
    }

    if (!identifier && config.trustForwardedHeaders) {
      identifier =
        context.req.header('cf-connecting-ip') ??
        context.req.header('x-real-ip') ??
        context.req.header('x-forwarded-host') ??
        undefined;
    }

    const result = limiter.consume(identifier ?? 'anonymous');

    if (!result.allowed) {
      context.header('x-ratelimit-limit', String(config.requestsPerSecond));
      context.header('x-ratelimit-remaining', '0');
      context.header('retry-after', String(Math.max(1, result.retryAfterSeconds)));
      return context.json(
        { error: { message: 'Rate limit exceeded. Try again in a moment.' } },
        429
      );
    }

    context.header('x-ratelimit-limit', String(config.requestsPerSecond));
    context.header('x-ratelimit-remaining', String(result.remaining));

    return null;
  };
};

const createOriginCache = (origins: string[]): Set<string> =>
  new Set(origins.map(normalizeOrigin));

const FAILED_CORS_RESPONSE = { error: { message: 'CORS origin not allowed' } } as const;

export const isOriginAllowed = (config: CorsRuntimeConfig, origin?: string | null): boolean => {
  if (!origin) {
    return true;
  }
  if (!config.enabled) {
    return true;
  }
  const normalized = normalizeOrigin(origin);
  return config.allowedOrigins.includes(normalized);
};

export const createCorsGuard = (config: CorsRuntimeConfig) => {
  if (!config.enabled) {
    return async (_context: Context, next: () => Promise<void>) => {
      await next();
    };
  }

  const allowed = createOriginCache(config.allowedOrigins);

  return async (context: Context, next: () => Promise<void>) => {
    const origin = context.req.header('origin');
    if (!origin) {
      await next();
      return;
    }

    const normalized = normalizeOrigin(origin);
    if (!allowed.has(normalized)) {
      return context.json(FAILED_CORS_RESPONSE, 403);
    }

    context.header('Access-Control-Allow-Origin', origin);
    if (config.allowCredentials) {
      context.header('Access-Control-Allow-Credentials', 'true');
    }
    context.header('Vary', 'Origin', { append: true });
    await next();
  };
};

export const createCorsPreflightHandler = (config: CorsRuntimeConfig) => {
  if (!config.enabled) {
    return () => {
      return new Response(null, { status: 204 });
    };
  }

  const allowed = createOriginCache(config.allowedOrigins);

  return (context: Context) => {
    const origin = context.req.header('origin');
    if (!origin) {
      return new Response(null, { status: 204 });
    }

    const normalized = normalizeOrigin(origin);
    if (!allowed.has(normalized)) {
      return context.json(FAILED_CORS_RESPONSE, 403);
    }

    const accessControlHeaders =
      context.req.header('access-control-request-headers') ??
      (config.allowHeaders.length > 0 ? config.allowHeaders.join(', ') : undefined);

    const response = new Response(null, { status: 204 });
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', config.allowMethods.join(', '));
    if (accessControlHeaders) {
      response.headers.set('Access-Control-Allow-Headers', accessControlHeaders);
    }
    if (config.allowCredentials) {
      response.headers.set('Access-Control-Allow-Credentials', 'true');
    }
    response.headers.set('Access-Control-Max-Age', '600');
    response.headers.append('Vary', 'Origin');
    response.headers.append('Vary', 'Access-Control-Request-Headers');
    response.headers.append('Vary', 'Access-Control-Request-Method');

    return response;
  };
};
