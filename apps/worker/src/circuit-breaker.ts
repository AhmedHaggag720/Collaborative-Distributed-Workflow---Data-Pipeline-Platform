export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  failureThreshold?: number;     // Failures before opening circuit
  resetTimeoutMs?: number;       // Time in ms circuit stays OPEN before entering HALF_OPEN
  halfOpenSuccessThreshold?: number; // Successes in HALF_OPEN to close circuit
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private successCount = 0;
  private nextAttemptAt = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 15000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 2;
  }

  getState(): CircuitState {
    if (this.state === 'OPEN' && Date.now() >= this.nextAttemptAt) {
      this.state = 'HALF_OPEN';
      this.successCount = 0;
    }
    return this.state;
  }

  async execute<T>(action: () => Promise<T>): Promise<T> {
    const currentState = this.getState();

    if (currentState === 'OPEN') {
      const waitTimeSec = Math.ceil((this.nextAttemptAt - Date.now()) / 1000);
      throw new CircuitBreakerOpenError(
        `[Circuit Breaker] Service is failing and currently OPEN. Failing fast. Will retry probe in ${waitTimeSec}s.`
      );
    }

    try {
      const result = await action();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.reset();
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.failureCount++;
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = 'OPEN';
    this.nextAttemptAt = Date.now() + this.resetTimeoutMs;
  }

  private reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttemptAt = 0;
  }
}

// Global registry of circuit breakers by endpoint domain
const circuitBreakersByHost = new Map<string, CircuitBreaker>();

export function getCircuitBreakerForUrl(url: string, options?: CircuitBreakerOptions): CircuitBreaker {
  try {
    const parsed = new URL(url);
    const host = parsed.host;
    let breaker = circuitBreakersByHost.get(host);
    if (!breaker) {
      breaker = new CircuitBreaker(options);
      circuitBreakersByHost.set(host, breaker);
    }
    return breaker;
  } catch {
    let defaultBreaker = circuitBreakersByHost.get('default');
    if (!defaultBreaker) {
      defaultBreaker = new CircuitBreaker(options);
      circuitBreakersByHost.set('default', defaultBreaker);
    }
    return defaultBreaker;
  }
}
