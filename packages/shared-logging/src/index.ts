/**
 * Lightweight logger used while the shared logging module is fleshed out.
 * Wraps console methods so packages have a consistent interface.
 */

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

const levelToConsole: Record<LogLevel, keyof Console> = {
  trace: 'trace',
  debug: 'debug',
  info: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'error'
};

const log = (level: LogLevel, args: unknown[]): void => {
  const method = levelToConsole[level];
  const consoleMethod = console[method];
  if (typeof consoleMethod === 'function') {
    Reflect.apply(consoleMethod as (...params: unknown[]) => void, console, args);
  } else {
    console.log(...args);
  }
};

export interface Logger {
  trace: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  fatal: (...args: unknown[]) => void;
}

export const createLogger = (): Logger => ({
  trace: (...args: unknown[]) => {
    log('trace', args);
  },
  debug: (...args: unknown[]) => {
    log('debug', args);
  },
  info: (...args: unknown[]) => {
    log('info', args);
  },
  warn: (...args: unknown[]) => {
    log('warn', args);
  },
  error: (...args: unknown[]) => {
    log('error', args);
  },
  fatal: (...args: unknown[]) => {
    log('fatal', args);
  }
});
