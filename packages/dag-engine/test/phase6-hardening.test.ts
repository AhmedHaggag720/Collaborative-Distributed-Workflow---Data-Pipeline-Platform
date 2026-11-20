import { describe, it } from 'node:test';
import assert from 'node:assert';
import { CircuitBreaker, CircuitBreakerOpenError } from '../../../apps/worker/src/circuit-breaker.js';
import { TokenBucketRateLimiter } from '../../../apps/api/src/rate-limiter.js';

describe('Phase 6: Production Hardening, Rate Limiting & Circuit Breaker', () => {
  describe('TokenBucketRateLimiter (In-Memory & Lua Fallback)', () => {
    it('should permit requests within capacity and reject excess traffic', async () => {
      const limiter = new TokenBucketRateLimiter(null);
      const tenantKey = 'test_tenant_burst';

      // Capacity = 5, Refill = 1 per sec
      for (let i = 0; i < 5; i++) {
        const res = await limiter.consume(tenantKey, { capacity: 5, refillPerSecond: 1 }, 1);
        assert.strictEqual(res.allowed, true, `Request ${i + 1} should be permitted`);
      }

      // 6th request must be rejected
      const overflow = await limiter.consume(tenantKey, { capacity: 5, refillPerSecond: 1 }, 1);
      assert.strictEqual(overflow.allowed, false, '6th request must be rate limited (token bucket empty)');
      assert.strictEqual(overflow.remaining, 0);
    });

    it('should refill tokens smoothly over elapsed time', async () => {
      const limiter = new TokenBucketRateLimiter(null);
      const tenantKey = 'test_tenant_refill';

      // Exhaust 2 tokens
      await limiter.consume(tenantKey, { capacity: 2, refillPerSecond: 10 }, 2);

      // Sleep 150ms -> should refill ~1.5 tokens (rounded to 1 allowed)
      await new Promise((r) => setTimeout(r, 150));

      const afterWait = await limiter.consume(tenantKey, { capacity: 2, refillPerSecond: 10 }, 1);
      assert.strictEqual(afterWait.allowed, true, 'Token should have refilled after wait duration');
    });
  });

  describe('CircuitBreaker (Fault Tolerance & Fail-Fast Protection)', () => {
    it('should start in CLOSED state and record successful dispatches', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 100 });
      assert.strictEqual(breaker.getState(), 'CLOSED');

      const res = await breaker.execute(async () => 'OK');
      assert.strictEqual(res, 'OK');
      assert.strictEqual(breaker.getState(), 'CLOSED');
    });

    it('should trip to OPEN after reaching failure threshold and fail fast immediately', async () => {
      const breaker = new CircuitBreaker({ failureThreshold: 3, resetTimeoutMs: 200 });

      // Trigger 3 consecutive failures
      for (let i = 0; i < 3; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error(`Upstream connection error ${i + 1}`);
          });
        } catch {
          // Expected failure
        }
      }

      // Circuit must now be OPEN
      assert.strictEqual(breaker.getState(), 'OPEN', 'Circuit breaker must trip to OPEN after 3 failures');

      // Next execution should fail fast without running the action
      let actionExecuted = false;
      await assert.rejects(
        async () => {
          await breaker.execute(async () => {
            actionExecuted = true;
            return 'Should not reach here';
          });
        },
        CircuitBreakerOpenError,
        'Should reject with CircuitBreakerOpenError'
      );

      assert.strictEqual(actionExecuted, false, 'Action must NOT be called when circuit is OPEN');
    });

    it('should transition to HALF_OPEN after resetTimeout and heal to CLOSED on successes', async () => {
      const breaker = new CircuitBreaker({
        failureThreshold: 2,
        resetTimeoutMs: 100, // Quick reset for testing
        halfOpenSuccessThreshold: 2,
      });

      // Trip circuit
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => { throw new Error('fail'); });
        } catch {}
      }
      assert.strictEqual(breaker.getState(), 'OPEN');

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 120));

      // Must now report HALF_OPEN
      assert.strictEqual(breaker.getState(), 'HALF_OPEN');

      // 1st probe success
      await breaker.execute(async () => 'probe_1');
      assert.strictEqual(breaker.getState(), 'HALF_OPEN');

      // 2nd probe success -> closes circuit!
      await breaker.execute(async () => 'probe_2');
      assert.strictEqual(breaker.getState(), 'CLOSED', 'Circuit should heal back to CLOSED after 2 consecutive probe successes');
    });
  });
});
