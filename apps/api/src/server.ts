import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import * as dotenv from 'dotenv';
import { Redis } from 'ioredis';
import { db, workflows, workflowVersions, executionRuns, executionSteps, eq, desc, and } from '@flowmesh/db';
import { CreateWorkflowSchema, UpdateWorkflowSchema } from '@flowmesh/schema';
import { validateDAG, findRootNodes } from '@flowmesh/dag-engine';

dotenv.config();

const port = Number(process.env.PORT_API || 4000);
const host = '0.0.0.0';

// Live Telemetry SSE Client Stream Registry
const sseClients = new Set<any>();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redisSub: Redis | null = null;

try {
  redisSub = new Redis(redisUrl, { retryStrategy: () => 3000, maxRetriesPerRequest: 1 });
  redisSub.subscribe('flowmesh:telemetry:events', (err) => {
    if (err) console.warn('[API Telemetry] Subscription warning:', err.message);
  });
  redisSub.on('message', (channel, message) => {
    if (channel === 'flowmesh:telemetry:events') {
      for (const client of sseClients) {
        try {
          client.write(`event: telemetry\ndata: ${message}\n\n`);
        } catch {
          sseClients.delete(client);
        }
      }
    }
  });
} catch {
  console.warn('[API Telemetry] Running without Redis subscriber');
}

export async function buildServer() {
  const server = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  await server.register(cors, {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  });

  await server.register(sensible);

  // Health check
  server.get('/health', async () => {
    let dbStatus = 'healthy';
    try {
      await db.execute('SELECT 1');
    } catch {
      dbStatus = 'disconnected';
    }

    return {
      status: 'ok',
      service: 'flowmesh-api',
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };
  });

  // Workflows CRUD
  server.get('/api/workflows', async () => {
    const list = await db.select().from(workflows).orderBy(desc(workflows.updatedAt));
    return { data: list };
  });

  server.get('/api/workflows/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id));
    if (!workflow) {
      return reply.notFound(`Workflow with ID ${id} not found.`);
    }
    return { data: workflow };
  });

  server.post('/api/workflows', async (req, reply) => {
    const parsed = CreateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    const { name, description, nodes, edges } = parsed.data;
    const validation = validateDAG(nodes, edges);
    if (!validation.isValid) {
      return reply.badRequest(`Invalid DAG: ${validation.errors.join(', ')}`);
    }

    const [created] = await db
      .insert(workflows)
      .values({
        name,
        description: description || '',
        nodes,
        edges,
        version: 1,
      })
      .returning();

    return reply.status(201).send({ data: created });
  });

  server.put('/api/workflows/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = UpdateWorkflowSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.badRequest(parsed.error.message);
    }

    const existing = await db.select().from(workflows).where(eq(workflows.id, id));
    if (existing.length === 0) {
      return reply.notFound(`Workflow ${id} not found.`);
    }

    const updates = parsed.data;
    if (updates.nodes && updates.edges) {
      const validation = validateDAG(updates.nodes, updates.edges);
      if (!validation.isValid) {
        return reply.badRequest(`Invalid DAG: ${validation.errors.join(', ')}`);
      }
    }

    const [updated] = await db
      .update(workflows)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, id))
      .returning();

    return { data: updated };
  });

  // Workflow Publishing & Versioning (Immutable snapshots)
  server.post('/api/workflows/:id/publish', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, id));

    if (!workflow) {
      return reply.notFound(`Workflow ${id} not found.`);
    }

    const nextVersion = (workflow.version || 1) + 1;

    // Create immutable snapshot in workflow_versions
    const [versionSnapshot] = await db
      .insert(workflowVersions)
      .values({
        workflowId: workflow.id,
        versionNumber: workflow.version || 1,
        snapshot: {
          nodes: workflow.nodes,
          edges: workflow.edges,
          viewport: workflow.viewport,
        },
        publishedAt: new Date(),
        publishedBy: (req.headers['x-user-id'] as string) || 'system',
      })
      .returning();

    // Mark current workflow as published and increment draft version
    await db
      .update(workflows)
      .set({
        isPublished: true,
        version: nextVersion,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, id));

    return reply.status(201).send({
      message: `Workflow published successfully as version ${versionSnapshot.versionNumber}`,
      data: versionSnapshot,
    });
  });

  server.get('/api/workflows/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    const versions = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, id))
      .orderBy(desc(workflowVersions.versionNumber));

    return { data: versions };
  });

  server.post('/api/workflows/:id/rollback/:versionId', async (req, reply) => {
    const { id, versionId } = req.params as { id: string; versionId: string };
    const [targetVersion] = await db
      .select()
      .from(workflowVersions)
      .where(and(eq(workflowVersions.id, versionId), eq(workflowVersions.workflowId, id)));

    if (!targetVersion) {
      return reply.notFound(`Version ${versionId} for workflow ${id} not found.`);
    }

    const snapshot = targetVersion.snapshot as any;
    const [restored] = await db
      .update(workflows)
      .set({
        nodes: snapshot.nodes || [],
        edges: snapshot.edges || [],
        viewport: snapshot.viewport || { x: 0, y: 0, zoom: 1 },
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, id))
      .returning();

    return {
      message: `Workflow restored to version ${targetVersion.versionNumber}`,
      data: restored,
    };
  });

  // Webhook Ingress (Triggers workflow execution)
  server.post('/hooks/:workflowId', async (req, reply) => {
    const { workflowId } = req.params as { workflowId: string };
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId));

    if (!workflow) {
      return reply.notFound(`Workflow ${workflowId} not found.`);
    }

    // Check if there is an active published version snapshot
    const [latestVersion] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.workflowId, workflow.id))
      .orderBy(desc(workflowVersions.versionNumber))
      .limit(1);

    const nodes = (latestVersion ? (latestVersion.snapshot as any).nodes : workflow.nodes) as any[];
    const edges = (latestVersion ? (latestVersion.snapshot as any).edges : workflow.edges) as any[];
    const rootNodes = findRootNodes(nodes, edges);

    if (rootNodes.length === 0) {
      return reply.badRequest(`Workflow ${workflowId} has no root trigger node.`);
    }

    const payload = {
      body: req.body || {},
      query: req.query || {},
      headers: {
        'content-type': req.headers['content-type'],
        'user-agent': req.headers['user-agent'],
      },
      receivedAt: new Date().toISOString(),
    };

    // Create execution run
    const [run] = await db
      .insert(executionRuns)
      .values({
        workflowId: workflow.id,
        workflowVersionId: latestVersion ? latestVersion.id : null,
        status: 'running',
        triggerType: 'webhook',
        triggerPayload: payload,
        startedAt: new Date(),
      })
      .returning();

    // Enqueue root steps
    for (const root of rootNodes) {
      await db.insert(executionSteps).values({
        runId: run.id,
        nodeId: root.id,
        status: 'queued',
        inputPayload: payload,
      });
    }

    return reply.status(202).send({
      message: 'Workflow execution triggered successfully.',
      runId: run.id,
      workflowVersion: latestVersion ? latestVersion.versionNumber : 'draft',
      queuedNodes: rootNodes.map((n) => n.id),
    });
  });

  // Dead-Letter Queue (DLQ) Management
  server.get('/api/dlq', async () => {
    const dlqSteps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.status, 'dlq'))
      .orderBy(desc(executionSteps.updatedAt))
      .limit(100);

    return { data: dlqSteps, totalCount: dlqSteps.length };
  });

  server.post('/api/dlq/replay/:stepId', async (req, reply) => {
    const { stepId } = req.params as { stepId: string };
    const [step] = await db.select().from(executionSteps).where(eq(executionSteps.id, stepId));

    if (!step) {
      return reply.notFound(`DLQ step ${stepId} not found.`);
    }

    // Reset step to queued state with fresh attempt counter
    const [replayed] = await db
      .update(executionSteps)
      .set({
        status: 'queued',
        attempt: 1,
        workerId: null,
        leasedAt: null,
        leasedUntil: null,
        error: null,
        updatedAt: new Date(),
      })
      .where(eq(executionSteps.id, stepId))
      .returning();

    // Ensure parent execution run is marked as running
    await db
      .update(executionRuns)
      .set({
        status: 'running',
        completedAt: null,
      })
      .where(eq(executionRuns.id, step.runId));

    return {
      message: `Step ${stepId} replayed from DLQ successfully.`,
      data: replayed,
    };
  });

  // Execution Runs
  server.get('/api/runs', async (req) => {
    const { workflowId } = req.query as { workflowId?: string };
    let query = db.select().from(executionRuns).orderBy(desc(executionRuns.createdAt)).limit(50);
    if (workflowId) {
      const runs = await db
        .select()
        .from(executionRuns)
        .where(eq(executionRuns.workflowId, workflowId))
        .orderBy(desc(executionRuns.createdAt))
        .limit(50);
      return { data: runs };
    }
    const runs = await query;
    return { data: runs };
  });

  server.get('/api/runs/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const [run] = await db.select().from(executionRuns).where(eq(executionRuns.id, id));
    if (!run) {
      return reply.notFound(`Execution run ${id} not found.`);
    }

    const steps = await db
      .select()
      .from(executionSteps)
      .where(eq(executionSteps.runId, id))
      .orderBy(executionSteps.createdAt);

    return { data: { ...run, steps } };
  });

  // Get specific step execution details (input/output payload, logs, trace)
  server.get('/api/runs/:runId/steps/:nodeId', async (req, reply) => {
    const { runId, nodeId } = req.params as { runId: string; nodeId: string };
    const [step] = await db
      .select()
      .from(executionSteps)
      .where(and(eq(executionSteps.runId, runId), eq(executionSteps.nodeId, nodeId)))
      .orderBy(desc(executionSteps.createdAt))
      .limit(1);

    if (!step) {
      return reply.notFound(`Step for node ${nodeId} in run ${runId} not found.`);
    }

    return { data: step };
  });

  // Get Node Performance & Latency Metrics (p50, p95, p99, error rates)
  server.get('/api/telemetry/metrics/:workflowId', async (req) => {
    const { workflowId } = req.params as { workflowId: string };
    const runs = await db
      .select({ id: executionRuns.id })
      .from(executionRuns)
      .where(eq(executionRuns.workflowId, workflowId));

    const runIds = runs.map((r) => r.id);
    if (runIds.length === 0) {
      return { data: {} };
    }

    const allSteps = await db.select().from(executionSteps);
    const relevantSteps = allSteps.filter((s) => runIds.includes(s.runId));

    const metricsByNode: Record<
      string,
      {
        nodeId: string;
        totalRuns: number;
        completed: number;
        failed: number;
        p50: number;
        p95: number;
        p99: number;
        avgDuration: number;
      }
    > = {};

    const durationsByNode: Record<string, number[]> = {};

    for (const step of relevantSteps) {
      if (!metricsByNode[step.nodeId]) {
        metricsByNode[step.nodeId] = {
          nodeId: step.nodeId,
          totalRuns: 0,
          completed: 0,
          failed: 0,
          p50: 0,
          p95: 0,
          p99: 0,
          avgDuration: 0,
        };
        durationsByNode[step.nodeId] = [];
      }

      const m = metricsByNode[step.nodeId];
      m.totalRuns++;
      if (step.status === 'completed') m.completed++;
      if (step.status === 'failed' || step.status === 'dlq') m.failed++;
      if (step.durationMs !== null && step.durationMs !== undefined) {
        durationsByNode[step.nodeId].push(step.durationMs);
      }
    }

    for (const [nodeId, durations] of Object.entries(durationsByNode)) {
      if (durations.length > 0) {
        durations.sort((a, b) => a - b);
        const m = metricsByNode[nodeId];
        const p50Idx = Math.floor(durations.length * 0.5);
        const p95Idx = Math.floor(durations.length * 0.95);
        const p99Idx = Math.floor(durations.length * 0.99);
        m.p50 = durations[p50Idx] ?? 0;
        m.p95 = durations[p95Idx] ?? durations[durations.length - 1];
        m.p99 = durations[p99Idx] ?? durations[durations.length - 1];
        m.avgDuration = Math.round(durations.reduce((acc, d) => acc + d, 0) / durations.length);
      }
    }

    return { data: metricsByNode };
  });

  // Server-Sent Events (SSE) Live Telemetry Stream
  server.get('/api/telemetry/stream', async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date() })}\n\n`);
    sseClients.add(reply.raw);

    const pingInterval = setInterval(() => {
      try {
        reply.raw.write(`event: ping\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
      } catch {
        clearInterval(pingInterval);
        sseClients.delete(reply.raw);
      }
    }, 15000);

    req.raw.on('close', () => {
      clearInterval(pingInterval);
      sseClients.delete(reply.raw);
    });
  });

  return server;
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  buildServer()
    .then((app) => {
      app.listen({ port, host }, (err, address) => {
        if (err) {
          app.log.error(err);
          process.exit(1);
        }
        app.log.info(`FlowMesh Control Plane API running at ${address}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start API server:', err);
      process.exit(1);
    });
}
