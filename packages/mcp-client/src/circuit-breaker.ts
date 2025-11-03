import {
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  type CircuitBreakerConfig,
  type CircuitState
} from './types.js';

export class CircuitBreaker {
  private readonly config: CircuitBreakerConfig;
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTimeMs: number | null = null;
  private halfOpenCalls = 0;

  constructor(config?: Partial<CircuitBreakerConfig>) {
    this.config = { ...DEFAULT_CIRCUIT_BREAKER_CONFIG, ...config };
  }

  canAttempt(nowMs: number): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      if (this.lastFailureTimeMs === null) {
        return false;
      }
      const elapsedSeconds = (nowMs - this.lastFailureTimeMs) / 1000;
      if (elapsedSeconds >= this.config.timeoutSeconds) {
        this.transitionToHalfOpen();
        return this.canAttempt(nowMs);
      }
      return false;
    }

    if (this.state === 'half_open') {
      if (this.halfOpenCalls < this.config.halfOpenMaxCalls) {
        this.halfOpenCalls += 1;
        return true;
      }
      return false;
    }

    return false;
  }

  recordSuccess(): void {
    if (this.state === 'half_open') {
      if (this.halfOpenCalls > 0) {
        this.halfOpenCalls -= 1;
      }
      this.successCount += 1;
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
      return;
    }

    if (this.state === 'closed') {
      this.failureCount = 0;
    }
  }

  recordFailure(nowMs: number): void {
    this.lastFailureTimeMs = nowMs;

    if (this.state === 'half_open') {
      if (this.halfOpenCalls > 0) {
        this.halfOpenCalls -= 1;
      }
      this.transitionToOpen();
      return;
    }

    if (this.state === 'closed') {
      this.failureCount += 1;
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
      return;
    }

    if (this.state === 'open') {
      // Keep failure count saturated while open.
      this.failureCount = this.config.failureThreshold;
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.transitionToClosed();
  }

  private transitionToClosed(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }

  private transitionToOpen(): void {
    this.state = 'open';
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }

  private transitionToHalfOpen(): void {
    this.state = 'half_open';
    this.successCount = 0;
    this.halfOpenCalls = 0;
  }
}
