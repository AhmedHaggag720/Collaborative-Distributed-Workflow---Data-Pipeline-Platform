import { Redis } from 'ioredis';
import crypto from 'node:crypto';
import { telemetryDb, telemetryLogs } from '@flowmesh/db';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redisPub: Redis | null = null;

try {
  redisPub = new Redis(redisUrl, { retryStrategy: () => 3000, maxRetriesPerRequest: 1 });
  redisPub.on('error', (err: any) => console.warn('[Telemetry] Redis warning:', err.message));
} catch {
  console.warn('[Telemetry] Running without Redis pub (in-memory mode)');
}

export interface StepTelemetryEvent {
  eventId: string;
  eventType: 'step_started' | 'step_completed' | 'step_failed' | 'step_dlq';
  runId: string;
  workflowId: string;
  nodeId: string;
  stepId: string;
  status: string;
  durationMs?: number;
  workerId: string;
  traceId: string;
  spanId: string;
  timestamp: string;
  outputPayload?: unknown;
  inputPayload?: unknown;
  error?: string | null;
  logs?: string[];
}

export function generateTraceId(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateSpanId(): string {
  return crypto.randomBytes(8).toString('hex');
}

// Publish telemetry event to Redis and batch-insert into TimescaleDB
export async function emitTelemetryEvent(event: StepTelemetryEvent): Promise<void> {
  const payloadStr = JSON.stringify(event);

  // 1. Stream to Redis Pub/Sub for SSE consumers
  if (redisPub && redisPub.status === 'ready') {
    redisPub.publish('flowmesh:telemetry:events', payloadStr).catch(() => {});
  }

  // 2. Persist to TimescaleDB telemetry_logs
  try {
    await telemetryDb.insert(telemetryLogs).values({
      eventType: event.eventType,
      runId: event.runId,
      workflowId: event.workflowId,
      nodeId: event.nodeId,
      stepId: event.stepId,
      status: event.status,
      durationMs: event.durationMs,
      timestamp: new Date(event.timestamp),
      payload: {
        traceId: event.traceId,
        spanId: event.spanId,
        workerId: event.workerId,
        output: event.outputPayload,
        logs: event.logs,
      },
      error: event.error,
    });
  } catch {
    // Graceful fallback if optional Timescale container isn't spun up yet
  }
}
