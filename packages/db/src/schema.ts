import { pgTable, uuid, varchar, text, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core';

export const workflows = pgTable('workflows', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description').default(''),
  version: integer('version').default(1).notNull(),
  nodes: jsonb('nodes').default([]).notNull(),
  edges: jsonb('edges').default([]).notNull(),
  viewport: jsonb('viewport').default({ x: 0, y: 0, zoom: 1 }).notNull(),
  isPublished: boolean('is_published').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workflowVersions = pgTable('workflow_versions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  versionNumber: integer('version_number').notNull(),
  snapshot: jsonb('snapshot').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: true }).defaultNow().notNull(),
  publishedBy: varchar('published_by', { length: 255 }),
});

export const executionRuns = pgTable('execution_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowId: uuid('workflow_id').references(() => workflows.id, { onDelete: 'cascade' }).notNull(),
  workflowVersionId: uuid('workflow_version_id'),
  status: varchar('status', { length: 50 }).default('pending').notNull(),
  triggerType: varchar('trigger_type', { length: 50 }).default('manual').notNull(),
  triggerPayload: jsonb('trigger_payload').default({}).notNull(),
  context: jsonb('context').default({}).notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  error: text('error'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const executionSteps = pgTable('execution_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').references(() => executionRuns.id, { onDelete: 'cascade' }).notNull(),
  nodeId: varchar('node_id', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('queued').notNull(),
  attempt: integer('attempt').default(1).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  workerId: varchar('worker_id', { length: 255 }),
  leasedAt: timestamp('leased_at', { withTimezone: true }),
  leasedUntil: timestamp('leased_until', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  durationMs: integer('duration_ms'),
  inputPayload: jsonb('input_payload'),
  outputPayload: jsonb('output_payload'),
  error: text('error'),
  logs: jsonb('logs').default([]).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const workerHeartbeats = pgTable('worker_heartbeats', {
  workerId: varchar('worker_id', { length: 255 }).primaryKey(),
  hostname: varchar('hostname', { length: 255 }).notNull(),
  status: varchar('status', { length: 50 }).default('active').notNull(),
  activeJobsCount: integer('active_jobs_count').default(0).notNull(),
  cpuPercent: text('cpu_percent').default('0'),
  memoryUsedMb: integer('memory_used_mb').default(0).notNull(),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).defaultNow().notNull(),
});

export const telemetryLogs = pgTable('telemetry_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  eventType: varchar('event_type', { length: 100 }).notNull(),
  runId: uuid('run_id').notNull(),
  workflowId: uuid('workflow_id').notNull(),
  nodeId: varchar('node_id', { length: 255 }),
  stepId: uuid('step_id'),
  status: varchar('status', { length: 50 }).notNull(),
  durationMs: integer('duration_ms'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb('payload'),
  error: text('error'),
});
