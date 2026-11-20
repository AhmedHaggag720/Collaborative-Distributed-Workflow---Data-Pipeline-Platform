import { z } from 'zod';
import { ExecutionStatusSchema, StepStatusSchema } from './execution.js';

export const TelemetryEventTypeSchema = z.enum([
  'run_started',
  'run_progress',
  'run_completed',
  'run_failed',
  'step_queued',
  'step_leased',
  'step_started',
  'step_completed',
  'step_failed',
  'step_retrying',
  'step_dlq',
  'worker_heartbeat',
]);

export type TelemetryEventType = z.infer<typeof TelemetryEventTypeSchema>;

export const StepEventSchema = z.object({
  eventId: z.string().uuid(),
  eventType: TelemetryEventTypeSchema,
  runId: z.string().uuid(),
  workflowId: z.string().uuid(),
  nodeId: z.string().optional(),
  stepId: z.string().uuid().optional(),
  status: z.union([ExecutionStatusSchema, StepStatusSchema]),
  timestamp: z.string().datetime(),
  durationMs: z.number().optional(),
  workerId: z.string().optional(),
  payload: z.unknown().optional(),
  error: z.string().optional(),
});

export type StepEvent = z.infer<typeof StepEventSchema>;

export const PresenceUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string(),
  cursor: z.object({
    x: z.number(),
    y: z.number(),
  }).nullable(),
  selectedNodeIds: z.array(z.string()).default([]),
  lastActive: z.number(),
});

export type PresenceUser = z.infer<typeof PresenceUserSchema>;
