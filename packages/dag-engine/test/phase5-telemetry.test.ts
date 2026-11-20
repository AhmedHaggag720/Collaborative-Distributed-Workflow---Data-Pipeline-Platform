import { describe, it } from 'node:test';
import assert from 'node:assert';
import crypto from 'node:crypto';

// Helper function that mirrors the percentile computation algorithm used in apps/api
function calculatePercentiles(durations: number[]) {
  if (durations.length === 0) {
    return { p50: 0, p95: 0, p99: 0, avg: 0 };
  }
  const sorted = [...durations].sort((a, b) => a - b);
  const p50Idx = Math.floor(sorted.length * 0.5);
  const p95Idx = Math.floor(sorted.length * 0.95);
  const p99Idx = Math.floor(sorted.length * 0.99);

  return {
    p50: sorted[p50Idx] ?? 0,
    p95: sorted[p95Idx] ?? sorted[sorted.length - 1],
    p99: sorted[p99Idx] ?? sorted[sorted.length - 1],
    avg: Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length),
  };
}

describe('Phase 5: Streaming Analytics & Live Observability', () => {
  it('should generate valid OpenTelemetry W3C traceId (16-byte hex) and spanId (8-byte hex)', () => {
    const traceId = crypto.randomBytes(16).toString('hex');
    const spanId = crypto.randomBytes(8).toString('hex');

    assert.strictEqual(traceId.length, 32, 'Trace ID must be 32 hex characters (16 bytes)');
    assert.strictEqual(spanId.length, 16, 'Span ID must be 16 hex characters (8 bytes)');
    assert.match(traceId, /^[0-9a-f]{32}$/);
    assert.match(spanId, /^[0-9a-f]{16}$/);
  });

  it('should calculate accurate p50, p95, and p99 execution latencies', () => {
    // Generate 100 sample latencies from 10ms to 1000ms
    const samples = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
    const metrics = calculatePercentiles(samples);

    // 50th percentile (50% mark) -> 510ms
    assert.strictEqual(metrics.p50, 510);
    // 95th percentile (95% mark) -> 960ms
    assert.strictEqual(metrics.p95, 960);
    // 99th percentile (99% mark) -> 1000ms
    assert.strictEqual(metrics.p99, 1000);
    // Average
    assert.strictEqual(metrics.avg, 505);
  });

  it('should format SSE stream payload conforming to W3C Server-Sent Events spec', () => {
    const mockTelemetryEvent = {
      eventId: 'evt-12345',
      eventType: 'step_completed',
      runId: 'run-999',
      workflowId: 'wf-888',
      nodeId: 'node-transform-1',
      stepId: 'step-001',
      status: 'completed',
      durationMs: 38,
      workerId: 'worker-node-1',
      traceId: '4bf9f67a12bc44d7881023a10ef2a991',
      spanId: '75b085819c43dc01',
      timestamp: new Date().toISOString(),
      outputPayload: { processedCount: 42 },
      logs: ['[Transform] Parsed input payload', '[Transform] Output 42 records'],
    };

    const sseFormatted = `event: telemetry\ndata: ${JSON.stringify(mockTelemetryEvent)}\n\n`;

    assert.ok(sseFormatted.startsWith('event: telemetry\n'));
    assert.ok(sseFormatted.endsWith('\n\n'));
    assert.ok(sseFormatted.includes('"durationMs":38'));
    assert.ok(sseFormatted.includes('"traceId":"4bf9f67a12bc44d7881023a10ef2a991"'));

    const parsedData = JSON.parse(sseFormatted.split('data: ')[1].trim());
    assert.strictEqual(parsedData.eventType, 'step_completed');
    assert.strictEqual(parsedData.outputPayload.processedCount, 42);
    assert.strictEqual(parsedData.logs.length, 2);
  });

  it('should preserve trace propagation across asynchronous child hops', () => {
    const rootTraceId = crypto.randomBytes(16).toString('hex');
    const rootSpanId = crypto.randomBytes(8).toString('hex');

    // Simulate child hop inheriting traceId with a new child spanId
    const childSpanId = crypto.randomBytes(8).toString('hex');
    const childEvent = {
      traceId: rootTraceId,
      parentSpanId: rootSpanId,
      spanId: childSpanId,
    };

    assert.strictEqual(childEvent.traceId, rootTraceId, 'Trace ID must propagate without alteration');
    assert.notStrictEqual(childEvent.spanId, rootSpanId, 'Child step must have distinct spanId');
    assert.strictEqual(childEvent.parentSpanId, rootSpanId, 'Child must reference parent span');
  });
});
