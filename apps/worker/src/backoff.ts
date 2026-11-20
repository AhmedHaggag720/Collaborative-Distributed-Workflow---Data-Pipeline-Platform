/**
 * Calculates exponential backoff with full jitter to avoid thundering herds.
 * Standard AWS/Google Cloud retry algorithm:
 * sleep = random_between(0, min(maxDelay, baseDelay * 2 ** attempt))
 */
export function calculateExponentialBackoffWithJitter(
  attempt: number,
  baseDelayMs = 1000,
  maxDelayMs = 30000
): number {
  const exponential = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)));
  // Full jitter: uniformly distributed between 0 and exponential
  return Math.floor(Math.random() * exponential);
}
