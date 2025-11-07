import { describe, expect, it, vi } from 'vitest';
import type { Context } from 'hono';
import type { IncomingMessage } from 'http';
import type { CorsRuntimeConfig } from './security.js';
import { createRateLimitGuard, createSecurityRuntime, isOriginAllowed } from './security.js';

const baseConfig = (): CorsRuntimeConfig => ({
  enabled: true,
  allowedOrigins: ['https://allowed.example.com'],
  allowCredentials: true,
  allowHeaders: ['content-type'],
  allowMethods: ['GET']
});

describe('isOriginAllowed', () => {
  it('allows any origin when cors is disabled', () => {
    const config = { ...baseConfig(), enabled: false };
    expect(isOriginAllowed(config, 'https://foo.example.com')).toBe(true);
  });

  it('checks origins when enabled', () => {
    const config = baseConfig();
    expect(isOriginAllowed(config, 'https://allowed.example.com')).toBe(true);
    expect(isOriginAllowed(config, 'https://blocked.example.com')).toBe(false);
  });
});

describe('createSecurityRuntime', () => {
  it('propagates disabled cors option', () => {
    const runtime = createSecurityRuntime({
      cors: {
        enabled: false
      }
    });
    expect(runtime.cors.enabled).toBe(false);
  });

  it('disables cors guard when no allowlist is provided', () => {
    const runtime = createSecurityRuntime(undefined, {
      NODE_ENV: 'production'
    } as NodeJS.ProcessEnv);
    expect(runtime.cors.enabled).toBe(false);
  });

  it('does not trust forwarded headers by default', () => {
    const runtime = createSecurityRuntime(undefined, {
      NODE_ENV: 'production'
    } as NodeJS.ProcessEnv);
    expect(runtime.rateLimit.trustForwardedHeaders).toBe(false);
  });

  it('allows opting into trusted proxy mode', () => {
    const runtime = createSecurityRuntime(
      {
        rateLimit: {
          trustForwardedHeaders: true
        }
      },
      {
        NODE_ENV: 'production'
      } as NodeJS.ProcessEnv
    );
    expect(runtime.rateLimit.trustForwardedHeaders).toBe(true);
  });
});

const createMockContext = (options: {
  headers?: Record<string, string>;
  remoteAddress?: string;
  socketAddress?: string;
}): Context => {
  const headers = new Headers();
  Object.entries(options.headers ?? {}).forEach(([key, value]) => headers.set(key, value));
  const incoming =
    options.remoteAddress || options.socketAddress
      ? ({
          socket: { remoteAddress: options.socketAddress ?? options.remoteAddress },
          connection: { remoteAddress: options.remoteAddress }
        } as unknown as IncomingMessage)
      : undefined;

  return {
    req: {
      raw: { headers },
      header: (name: string) => headers.get(name.toLowerCase())
    },
    env: incoming ? { incoming } : {},
    header: vi.fn(),
    json: vi.fn((body, status) => ({ body, status }))
  } as unknown as Context;
};

describe('createRateLimitGuard', () => {
  it('ignores spoofable headers when trustForwardedHeaders is disabled', () => {
    const limiter = {
      consume: vi.fn().mockReturnValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 })
    };
    const guard = createRateLimitGuard(
      {
        enabled: true,
        requestsPerSecond: 10,
        burst: 10,
        trustForwardedHeaders: false
      },
      limiter
    );
    expect(guard).toBeTruthy();
    const context = createMockContext({
      remoteAddress: '10.0.0.5',
      headers: {
        'x-client-ip': '198.51.100.1'
      }
    });
    guard?.(context);
    expect(limiter.consume).toHaveBeenCalledWith('10.0.0.5');
  });

  it('uses forwarded headers only when trustForwardedHeaders is enabled', () => {
    const limiter = {
      consume: vi.fn().mockReturnValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 })
    };
    const guard = createRateLimitGuard(
      {
        enabled: true,
        requestsPerSecond: 10,
        burst: 10,
        trustForwardedHeaders: true
      },
      limiter
    );
    const context = createMockContext({
      remoteAddress: '10.0.0.5',
      headers: {
        'x-forwarded-for': '198.51.100.1, 203.0.113.5',
        'x-client-ip': '198.51.100.1'
      }
    });
    guard?.(context);
    expect(limiter.consume).toHaveBeenCalledWith('198.51.100.1');
  });
});
