export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Readonly<Record<string, unknown>>;

export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly name?: string;
  readonly context?: LogContext;
}

export type LogFn = (message: string, context?: LogContext) => void;

export interface Logger {
  readonly debug: LogFn;
  readonly info: LogFn;
  readonly warn: LogFn;
  readonly error: LogFn;
}

export interface LoggerOptions {
  readonly name?: string;
  readonly level?: LogLevel;
  readonly sink?: (entry: LogEntry) => void;
}

const DEFAULT_LEVEL: LogLevel = "info";

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

const WRITER: Record<
  LogLevel,
  (message?: unknown, ...optionalParams: unknown[]) => void
> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

const NOOP: LogFn = () => {
  // intentionally empty
};

export const noopLogger: Logger = {
  debug: NOOP,
  info: NOOP,
  warn: NOOP,
  error: NOOP
};

const shouldLog = (level: LogLevel, minLevel: LogLevel): boolean =>
  SEVERITY[level] >= SEVERITY[minLevel];

const defaultSink = (entry: LogEntry): void => {
  const { level, message, timestamp, name, context } = entry;
  const prefix =
    name !== undefined && name.length > 0
      ? `[${timestamp}] [${name}]`
      : `[${timestamp}]`;
  const payload =
    context === undefined || Object.keys(context).length === 0
      ? message
      : `${message} ${JSON.stringify(context)}`;
  WRITER[level](`${prefix} ${payload}`);
};

export const createConsoleLogger = (options?: LoggerOptions): Logger => {
  const minLevel = options?.level ?? DEFAULT_LEVEL;
  const sink = options?.sink ?? defaultSink;
  const name = options?.name;

  const makeLogger = (level: LogLevel): LogFn => {
    if (!shouldLog(level, minLevel)) {
      return NOOP;
    }
    return (message: string, context?: LogContext) => {
      sink({
        level,
        message,
        context,
        name,
        timestamp: new Date().toISOString()
      });
    };
  };

  return {
    debug: makeLogger("debug"),
    info: makeLogger("info"),
    warn: makeLogger("warn"),
    error: makeLogger("error")
  };
};

export const createLogger = createConsoleLogger;
