import { Redis } from 'ioredis';

const LUA_TOKEN_BUCKET = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2]) -- tokens per millisecond
local now = tonumber(ARGV[3])
local requested = tonumber(ARGV[4] or 1)

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil then
  tokens = capacity
  last_refill = now
else
  local delta = math.max(0, now - last_refill)
  tokens = math.min(capacity, tokens + delta * refill_rate)
  last_refill = now
end

if tokens >= requested then
  tokens = tokens - requested
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
  local ttl = math.max(1, math.ceil(capacity / math.max(refill_rate * 1000, 0.001)))
  redis.call('EXPIRE', key, ttl)
  return {1, math.floor(tokens)}
else
  redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
  local ttl = math.max(1, math.ceil(capacity / math.max(refill_rate * 1000, 0.001)))
  redis.call('EXPIRE', key, ttl)
  return {0, math.floor(tokens)}
end
`;

export interface RateLimitOptions {
  capacity: number;       // Maximum burst capacity
  refillPerSecond: number; // Tokens refilled per second
}

export class TokenBucketRateLimiter {
  private redis: Redis | null = null;
  private inMemoryBuckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(redisClient?: Redis | null) {
    this.redis = redisClient || null;
  }

  /**
   * Evaluates if a request is permitted under token bucket limits.
   * Returns { allowed: boolean, remaining: number }
   */
  async consume(
    key: string,
    options: RateLimitOptions = { capacity: 60, refillPerSecond: 10 },
    requested = 1
  ): Promise<{ allowed: boolean; remaining: number }> {
    const now = Date.now();
    const redisKey = `flowmesh:ratelimit:${key}`;

    if (this.redis && this.redis.status === 'ready') {
      try {
        const refillRatePerMs = options.refillPerSecond / 1000;
        const result = (await this.redis.eval(
          LUA_TOKEN_BUCKET,
          1,
          redisKey,
          options.capacity,
          refillRatePerMs,
          now,
          requested
        )) as [number, number];

        return {
          allowed: result[0] === 1,
          remaining: result[1],
        };
      } catch {
        // Fallback to in-memory on Redis error
      }
    }

    // In-memory fallback
    let bucket = this.inMemoryBuckets.get(key);
    if (!bucket) {
      bucket = { tokens: options.capacity, lastRefill: now };
      this.inMemoryBuckets.set(key, bucket);
    } else {
      const elapsedMs = Math.max(0, now - bucket.lastRefill);
      const refill = elapsedMs * (options.refillPerSecond / 1000);
      bucket.tokens = Math.min(options.capacity, bucket.tokens + refill);
      bucket.lastRefill = now;
    }

    if (bucket.tokens >= requested) {
      bucket.tokens -= requested;
      return { allowed: true, remaining: Math.floor(bucket.tokens) };
    }

    return { allowed: false, remaining: Math.floor(bucket.tokens) };
  }
}
