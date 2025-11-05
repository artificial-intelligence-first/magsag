import { EventEmitter } from 'node:events';

export interface ExecutionMetrics {
  planId: string;
  timestamp: number;
  parallelCount: number;
  totalTasks: number;
  successCount: number;
  failureCount: number;
  averageTimeMs: number;
  cpuUtilization?: number;
  memoryUtilization?: number;
}

export interface AutoTuneConfig {
  targetFailureRate?: number;  // Default: 0.05 (5%)
  maxFailureRate?: number;     // Default: 0.20 (20%)
  adjustmentStep?: number;      // Default: 1
  minParallel?: number;        // Default: 1
  maxParallel?: number;        // Default: 10
  windowSize?: number;         // Default: 5 (last 5 runs)
  cooldownMs?: number;         // Default: 60000 (1 minute)
}

const DEFAULT_CONFIG: Required<AutoTuneConfig> = {
  targetFailureRate: 0.05,
  maxFailureRate: 0.20,
  adjustmentStep: 1,
  minParallel: 1,
  maxParallel: 10,
  windowSize: 5,
  cooldownMs: 60000
};

export class AutoTune extends EventEmitter {
  private config: Required<AutoTuneConfig>;
  private metricsWindow: ExecutionMetrics[] = [];
  private currentParallel: number;
  private lastAdjustmentTime = 0;

  constructor(initialParallel: number, config: AutoTuneConfig = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentParallel = Math.min(
      Math.max(initialParallel, this.config.minParallel),
      this.config.maxParallel
    );
  }

  /**
   * Record execution metrics and potentially adjust parallelism
   */
  recordExecution(metrics: ExecutionMetrics): number {
    // Add to sliding window
    this.metricsWindow.push(metrics);
    if (this.metricsWindow.length > this.config.windowSize) {
      this.metricsWindow.shift();
    }

    // Check if we should adjust
    const now = Date.now();
    if (now - this.lastAdjustmentTime < this.config.cooldownMs) {
      return this.currentParallel; // Still in cooldown
    }

    // Calculate failure rate
    const failureRate = this.calculateFailureRate();
    const avgTime = this.calculateAverageTime();
    const cpuUtil = this.calculateAverageCpuUtil();

    // Decision logic
    let adjustment = 0;

    if (failureRate > this.config.maxFailureRate) {
      // Too many failures, reduce parallelism
      adjustment = -this.config.adjustmentStep;
      this.emit('adjustment', {
        reason: 'high_failure_rate',
        failureRate,
        adjustment
      });
    } else if (failureRate < this.config.targetFailureRate) {
      // Low failure rate, can we increase?
      if (cpuUtil !== null && cpuUtil < 0.7) {
        // CPU not fully utilized, increase parallelism
        adjustment = this.config.adjustmentStep;
        this.emit('adjustment', {
          reason: 'low_cpu_utilization',
          cpuUtil,
          failureRate,
          adjustment
        });
      } else if (this.hasDecreasingTrend()) {
        // Performance improving, try increasing
        adjustment = this.config.adjustmentStep;
        this.emit('adjustment', {
          reason: 'improving_performance',
          avgTime,
          failureRate,
          adjustment
        });
      }
    }

    // Apply adjustment
    if (adjustment !== 0) {
      const newParallel = Math.min(
        Math.max(this.currentParallel + adjustment, this.config.minParallel),
        this.config.maxParallel
      );

      if (newParallel !== this.currentParallel) {
        this.currentParallel = newParallel;
        this.lastAdjustmentTime = now;
        this.emit('parallelismChanged', {
          old: this.currentParallel - adjustment,
          new: newParallel,
          failureRate,
          cpuUtil,
          avgTime
        });
      }
    }

    return this.currentParallel;
  }

  /**
   * Get current recommended parallelism
   */
  getRecommendedParallel(): number {
    return this.currentParallel;
  }

  /**
   * Force set parallelism (e.g., for manual override)
   */
  setParallel(value: number): void {
    this.currentParallel = Math.min(
      Math.max(value, this.config.minParallel),
      this.config.maxParallel
    );
    this.lastAdjustmentTime = Date.now();
    this.emit('manualOverride', { parallel: this.currentParallel });
  }

  /**
   * Get current metrics summary
   */
  getMetricsSummary(): {
    currentParallel: number;
    windowSize: number;
    failureRate: number;
    averageTimeMs: number;
    cpuUtilization: number | null;
  } {
    return {
      currentParallel: this.currentParallel,
      windowSize: this.metricsWindow.length,
      failureRate: this.calculateFailureRate(),
      averageTimeMs: this.calculateAverageTime(),
      cpuUtilization: this.calculateAverageCpuUtil()
    };
  }

  private calculateFailureRate(): number {
    if (this.metricsWindow.length === 0) return 0;

    const totals = this.metricsWindow.reduce(
      (acc, m) => ({
        success: acc.success + m.successCount,
        failure: acc.failure + m.failureCount
      }),
      { success: 0, failure: 0 }
    );

    const total = totals.success + totals.failure;
    return total === 0 ? 0 : totals.failure / total;
  }

  private calculateAverageTime(): number {
    if (this.metricsWindow.length === 0) return 0;

    const sum = this.metricsWindow.reduce((acc, m) => acc + m.averageTimeMs, 0);
    return sum / this.metricsWindow.length;
  }

  private calculateAverageCpuUtil(): number | null {
    const withCpu = this.metricsWindow.filter(m => m.cpuUtilization !== undefined);
    if (withCpu.length === 0) return null;

    const sum = withCpu.reduce((acc, m) => acc + m.cpuUtilization!, 0);
    return sum / withCpu.length;
  }

  private hasDecreasingTrend(): boolean {
    if (this.metricsWindow.length < 3) return false;

    // Check if last 3 measurements show decreasing trend
    const recent = this.metricsWindow.slice(-3).map(m => m.averageTimeMs);
    for (let i = 1; i < recent.length; i++) {
      if (recent[i] >= recent[i - 1]) {
        return false; // Not strictly decreasing
      }
    }

    return true;
  }

  /**
   * Reset metrics and optionally parallelism
   */
  reset(resetParallel = false): void {
    this.metricsWindow = [];
    this.lastAdjustmentTime = 0;

    if (resetParallel) {
      this.currentParallel = Math.floor((this.config.minParallel + this.config.maxParallel) / 2);
    }

    this.emit('reset', { parallelism: this.currentParallel });
  }
}

// Singleton instance for global auto-tuning
let globalAutoTune: AutoTune | null = null;

export function getGlobalAutoTune(initialParallel?: number): AutoTune {
  if (!globalAutoTune) {
    globalAutoTune = new AutoTune(initialParallel ?? 3);
  }
  return globalAutoTune;
}

export function resetGlobalAutoTune(): void {
  if (globalAutoTune) {
    globalAutoTune.reset(true);
  }
  globalAutoTune = null;
}
