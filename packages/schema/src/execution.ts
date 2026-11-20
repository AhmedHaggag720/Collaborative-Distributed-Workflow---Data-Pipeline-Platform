import { z } from 'zod';

export const ExecutionStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type ExecutionStatus = z.infer<typeof ExecutionStatusSchema>;

export const StepStatusSchema = z.enum([
  'queued',
  'leased',
  'running',
  'completed',
  'failed',
  'retrying',
  'dlq',
  'skipped',
]);

export type StepStatus = z.infer<typeof StepStatusSchema>;

export const TriggerTypeSchema = z.enum(['webhook', 'manual', 'cron', 'replay']);

export type TriggerType = z.infer<typeof TriggerTypeSchema>;

export const ExecutionRunSchema = z.object({
  id: z.string().uuid(),
  workflowId: z.string().uuid(),
  workflowVersionId: z.string().uuid().nullable().optional(),
  status: ExecutionStatusSchema.default('pending'),
  triggerType: TriggerTypeSchema.default('manual'),
  triggerPayload: z.record(z.unknown()).default({}),
  context: z.record(z.unknown()).default({}),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  error: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
});

export type ExecutionRun = z.infer<typeof ExecutionRunSchema>;

export const ExecutionStepSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  nodeId: z.string().min(1),
  status: StepStatusSchema.default('queued'),
  attempt: z.number().int().min(1).default(1),
  maxAttempts: z.number().int().min(1).default(3),
  workerId: z.string().nullable().optional(),
  leasedAt: z.string().datetime().nullable().optional(),
  leasedUntil: z.string().datetime().nullable().optional(),
  startedAt: z.string().datetime().nullable().optional(),
  completedAt: z.string().datetime().nullable().optional(),
  durationMs: z.number().int().nonnegative().nullable().optional(),
  inputPayload: z.unknown().optional(),
  outputPayload: z.unknown().optional(),
  error: z.string().nullable().optional(),
  logs: z.array(z.string()).default([]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type ExecutionStep = z.infer<typeof ExecutionStepSchema>;
