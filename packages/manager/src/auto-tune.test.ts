import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AutoTune } from './auto-tune.js';

describe('AutoTune', () => {
  let autoTune: AutoTune;

  beforeEach(() => {
    autoTune = new AutoTune(3, {
      targetFailureRate: 0.05,
      maxFailureRate: 0.20,
      adjustmentStep: 1,
      minParallel: 1,
      maxParallel: 5,
      windowSize: 3,
      cooldownMs: 100 // Short cooldown for testing
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Basic functionality', () => {
    it('should initialize with given parallelism', () => {
      expect(autoTune.getRecommendedParallel()).toBe(3);
    });

    it('should respect min/max bounds', () => {
      const tune = new AutoTune(10, { minParallel: 1, maxParallel: 5 });
      expect(tune.getRecommendedParallel()).toBe(5);

      const tune2 = new AutoTune(0, { minParallel: 1, maxParallel: 5 });
      expect(tune2.getRecommendedParallel()).toBe(1);
    });

    it('should allow manual override', () => {
      autoTune.setParallel(4);
      expect(autoTune.getRecommendedParallel()).toBe(4);

      autoTune.setParallel(10);
      expect(autoTune.getRecommendedParallel()).toBe(5); // Max is 5
    });
  });

  describe('Failure rate adjustments', () => {
    it('should decrease parallelism on high failure rate', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000);
      const first = autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1_000
      });
      expect(first).toBe(2);

      vi.setSystemTime(1_050); // still within cooldown
      const duringCooldown = autoTune.recordExecution({
        planId: 'plan1b',
        timestamp: Date.now(),
        parallelCount: 2,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1_000
      });
      expect(duringCooldown).toBe(2);

      vi.setSystemTime(1_120); // after cooldown
      const next = autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 2,
        totalTasks: 10,
        successCount: 4,
        failureCount: 6,
        averageTimeMs: 1_000
      });
      expect(next).toBe(1);
    });

    it('should not adjust during cooldown', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000);
      autoTune.recordExecution({
        planId: 'plan0',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1_000
      });

      vi.setSystemTime(1_050);
      const decreased = autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1_000
      });
      expect(decreased).toBe(2);

      const duringCooldown = autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 2,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1_000
      });
      expect(duringCooldown).toBe(2);

      vi.setSystemTime(1_200); // after cooldown
      const postCooldown = autoTune.recordExecution({
        planId: 'plan3',
        timestamp: Date.now(),
        parallelCount: 2,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1_000
      });
      expect(postCooldown).toBe(1);
    });

    it('should increase parallelism on low CPU utilization', () => {
      vi.useFakeTimers();
      vi.setSystemTime(1_000);
      const first = autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 10,
        failureCount: 0,
        averageTimeMs: 1_000,
        cpuUtilization: 0.3
      });
      expect(first).toBe(4);
      vi.setSystemTime(1_050);
      const duringCooldown = autoTune.recordExecution({
        planId: 'plan1b',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 10,
        failureCount: 0,
        averageTimeMs: 1_000,
        cpuUtilization: 0.4
      });
      expect(duringCooldown).toBe(4);
      vi.setSystemTime(1_120);
      const increased = autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 10,
        failureCount: 0,
        averageTimeMs: 1_000,
        cpuUtilization: 0.5
      });
      expect(increased).toBe(5);
    });
  });

  describe('Metrics calculation', () => {
    it('should calculate correct failure rate', () => {
      autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 8,
        failureCount: 2,
        averageTimeMs: 1000
      });

      autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 7,
        failureCount: 3,
        averageTimeMs: 1000
      });

      const summary = autoTune.getMetricsSummary();
      expect(summary.failureRate).toBeCloseTo(0.25); // 5 failures out of 20 total
    });

    it('should maintain sliding window', () => {
      // Add 4 executions (window size is 3)
      for (let i = 0; i < 4; i++) {
        autoTune.recordExecution({
          planId: `plan${i}`,
          timestamp: Date.now(),
          parallelCount: 3,
          totalTasks: 10,
          successCount: 10,
          failureCount: 0,
          averageTimeMs: 1000 + i * 100
        });
      }

      const summary = autoTune.getMetricsSummary();
      expect(summary.windowSize).toBe(3); // Only last 3
      expect(summary.averageTimeMs).toBeCloseTo(1200); // Average of 1100, 1200, 1300
    });
  });

  describe('Event emissions', () => {
    it('should emit adjustment events', async () => {
      const adjustmentListener = vi.fn();
      const changeListener = vi.fn();

      autoTune.on('adjustment', adjustmentListener);
      autoTune.on('parallelismChanged', changeListener);

      // Trigger high failure adjustment
      autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1000
      });

      await new Promise(resolve => setTimeout(resolve, 110));

      autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1000
      });

      expect(adjustmentListener).toHaveBeenCalled();
      expect(changeListener).toHaveBeenCalled();

      const adjustmentCall = adjustmentListener.mock.calls[0][0];
      expect(adjustmentCall.reason).toBe('high_failure_rate');
      expect(adjustmentCall.adjustment).toBe(-1);
    });

    it('should emit manual override event', () => {
      const overrideListener = vi.fn();
      autoTune.on('manualOverride', overrideListener);

      autoTune.setParallel(4);

      expect(overrideListener).toHaveBeenCalledWith({ parallel: 4 });
    });

    it('should emit reset event', () => {
      const resetListener = vi.fn();
      autoTune.on('reset', resetListener);

      autoTune.reset(true);

      expect(resetListener).toHaveBeenCalled();
    });
  });

  describe('Reset functionality', () => {
    it('should clear metrics on reset', () => {
      // Add some metrics
      autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 8,
        failureCount: 2,
        averageTimeMs: 1000
      });

      autoTune.reset();

      const summary = autoTune.getMetricsSummary();
      expect(summary.windowSize).toBe(0);
      expect(summary.failureRate).toBe(0);
    });

    it('should reset parallelism when requested', () => {
      autoTune.setParallel(5);
      expect(autoTune.getRecommendedParallel()).toBe(5);

      autoTune.reset(true);

      // Should reset to middle of range (1-5) = 3
      expect(autoTune.getRecommendedParallel()).toBe(3);
    });
  });
});
