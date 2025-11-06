# @magsag/shared-logging

Lightweight logging utilities with console fallbacks for the MAGSAG framework.

## Overview

`@magsag/shared-logging` provides minimal, dependency-free logging utilities used across the MAGSAG stack. It offers structured logging with fallback to console output when no advanced logging system is configured.

## Features

- Zero dependencies
- Structured logging support
- Log level filtering
- Console fallback
- TypeScript type safety
- Minimal performance overhead

## Usage

```typescript
import { Logger, createLogger } from '@magsag/shared-logging';

// Create a logger instance
const logger = createLogger({
  name: 'my-service',
  level: 'info',
});

// Log at different levels
logger.debug('Debug message', { detail: 'extra info' });
logger.info('Info message', { user: 'alice' });
logger.warn('Warning message', { code: 'WARN_001' });
logger.error('Error message', { error: new Error('Failed') });
```

## Log Levels

Supported log levels (in order of severity):

1. **debug** - Detailed debugging information
2. **info** - General informational messages
3. **warn** - Warning messages
4. **error** - Error messages

```typescript
const logger = createLogger({ level: 'warn' });

logger.debug('Not logged');
logger.info('Not logged');
logger.warn('Logged');  // ✅
logger.error('Logged'); // ✅
```

## Structured Logging

Logs support structured metadata:

```typescript
logger.info('User action', {
  userId: '123',
  action: 'login',
  timestamp: new Date().toISOString(),
  ip: '192.168.1.1',
});

// Output:
// [2025-11-06T08:00:00Z] INFO [my-service]: User action
//   userId: 123
//   action: login
//   timestamp: 2025-11-06T08:00:00Z
//   ip: 192.168.1.1
```

## Logger Configuration

```typescript
const logger = createLogger({
  name: 'my-service',      // Logger name (appears in output)
  level: 'info',            // Minimum log level
  timestamp: true,          // Include timestamps (default: true)
  colors: true,             // Use colors in console (default: true)
  pretty: true,             // Pretty-print objects (default: true)
});
```

## Logger Interface

```typescript
interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;

  child(options: { name: string }): Logger;
}
```

## Child Loggers

Create child loggers with inherited configuration:

```typescript
const parentLogger = createLogger({ name: 'app', level: 'info' });
const childLogger = parentLogger.child({ name: 'database' });

childLogger.info('Connected');
// [2025-11-06T08:00:00Z] INFO [app:database]: Connected
```

## Default Logger

A default logger is exported for convenience:

```typescript
import { logger } from '@magsag/shared-logging';

logger.info('Quick log');
```

## Console Fallback

When no configuration is provided, logging falls back to console:

```typescript
const logger = createLogger();

logger.info('Message');
// Calls console.log with formatting
```

## Integration with Other Packages

Used throughout MAGSAG:

```typescript
// In @magsag/core
import { createLogger } from '@magsag/shared-logging';

const logger = createLogger({ name: 'core' });

export class ExecutionWorkspace {
  constructor() {
    logger.info('Workspace created');
  }
}
```

## Production Use

In production, you may want to integrate with external logging services:

```typescript
import { createLogger } from '@magsag/shared-logging';
import { WinstonTransport } from 'your-winston-adapter';

const logger = createLogger({
  name: 'magsag',
  level: process.env.LOG_LEVEL || 'info',
  // Add custom transport
  transport: new WinstonTransport(),
});
```

## Environment Variables

- `LOG_LEVEL` - Set log level (`debug|info|warn|error`)
- `LOG_COLORS` - Enable/disable colors (`true|false`)
- `LOG_TIMESTAMP` - Enable/disable timestamps (`true|false`)

```bash
export LOG_LEVEL=debug
export LOG_COLORS=true
export LOG_TIMESTAMP=true

pnpm --filter @magsag/cli exec magsag agent exec --plan plan.json
```

## Performance

- Overhead: <1ms per log call
- Memory: ~100 bytes per log entry
- No async operations (synchronous logging)

## Development

```bash
# Run tests
pnpm --filter @magsag/shared-logging test

# Type checking
pnpm --filter @magsag/shared-logging typecheck

# Linting
pnpm --filter @magsag/shared-logging lint

# Build
pnpm --filter @magsag/shared-logging build
```

## API

### createLogger(options?)

Creates a new logger instance.

```typescript
const logger = createLogger({
  name?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  timestamp?: boolean;
  colors?: boolean;
  pretty?: boolean;
});
```

### logger.debug(message, meta?)

Log at debug level.

### logger.info(message, meta?)

Log at info level.

### logger.warn(message, meta?)

Log at warn level.

### logger.error(message, meta?)

Log at error level.

### logger.child(options)

Create a child logger.

## No Dependencies

This package has zero runtime dependencies, making it safe to use as a foundation for other packages without circular dependency issues.

## License

Apache-2.0
