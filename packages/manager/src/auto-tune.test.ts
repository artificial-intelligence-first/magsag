import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    it.skip('should decrease parallelism on high failure rate', async () => {
      // Record executions with high failure rate
      autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5, // 50% failure rate
        averageTimeMs: 1000
      });

      autoTune.recordExecution({
        planId: 'plan1b',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5, // 50% failure rate
        averageTimeMs: 1000
      });

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 110));

      const newParallel = autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 6,
        failureCount: 4, // 40% failure rate - window avg is 46.7%
        averageTimeMs: 1000
      });

      // Should decrease due to >20% failure rate
      expect(newParallel).toBe(2);
    });

    it.skip('should not adjust during cooldown', async () => {
      // First set up the failure conditions
      autoTune.recordExecution({
        planId: 'plan0',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1000
      });

      await new Promise(resolve => setTimeout(resolve, 110)); // wait for cooldown

      // This should trigger a decrease from 3 to 2
      const p1 = autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1000
      });

      expect(p1).toBe(2); // Should have decreased

      // Immediate second call (within cooldown) - should not change
      const parallel = autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 2,
        totalTasks: 10,
        successCount: 5,
        failureCount: 5,
        averageTimeMs: 1000
      });

      // Should not change due to cooldown
      expect(parallel).toBe(2);
    });

    it.skip('should increase parallelism on low CPU utilization', async () => {
      // Record good executions with low CPU - need multiple for window
      autoTune.recordExecution({
        planId: 'plan1',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 10,
        failureCount: 0, // 0% failure rate
        averageTimeMs: 1000,
        cpuUtilization: 0.3 // 30% CPU
      });

      autoTune.recordExecution({
        planId: 'plan1b',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 10,
        failureCount: 0, // 0% failure rate
        averageTimeMs: 1000,
        cpuUtilization: 0.3 // 30% CPU
      });

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 110));

      const newParallel = autoTune.recordExecution({
        planId: 'plan2',
        timestamp: Date.now(),
        parallelCount: 3,
        totalTasks: 10,
        successCount: 10,
        failureCount: 0,
        averageTimeMs: 1000,
        cpuUtilization: 0.4 // 40% CPU - avg is still <0.7
      });

      // Should increase due to low CPU utilization
      expect(newParallel).toBe(4);
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