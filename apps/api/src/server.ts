import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import * as dotenv from 'dotenv';
import { db, workflows, executionRuns, executionSteps, eq, desc } from '@flowmesh/db';
import { CreateWorkflowSchema, UpdateWorkflowSchema } from '@flowmesh/schema';
import { validateDAG, findRootNodes } from '@flowmesh/dag-engine';

dotenv.config();

const port = Number(process.env.PORT_API || 4000);
const host = '0.0.0.0';

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

  // Webhook Ingress (Triggers workflow execution)
  server.post('/hooks/:workflowId', async (req, reply) => {
    const { workflowId } = req.params as { workflowId: string };
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, workflowId));

    if (!workflow) {
      return reply.notFound(`Workflow ${workflowId} not found.`);
    }

    const nodes = workflow.nodes as any[];
    const edges = workflow.edges as any[];
    const rootNodes = findRootNodes(nodes, edges);

    if (rootNodes.length === 0) {
      return reply.badRequest(`Workflow ${workflowId} has no root trigger node.`);
    }

    // Create execution run
    const [run] = await db
      .insert(executionRuns)
      .values({
        workflowId: workflow.id,
        status: 'running',
        triggerType: 'webhook',
        triggerPayload: (req.body as any) || {},
        startedAt: new Date(),
      })
      .returning();

    // Enqueue root steps
    for (const root of rootNodes) {
      await db.insert(executionSteps).values({
        runId: run.id,
        nodeId: root.id,
        status: 'queued',
        inputPayload: req.body || {},
      });
    }

    return reply.status(202).send({
      message: 'Workflow execution triggered successfully.',
      runId: run.id,
      queuedNodes: rootNodes.map((n) => n.id),
    });
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

  // Server-Sent Events (SSE) Live Telemetry Stream
  server.get('/api/telemetry/stream', async (req, reply) => {
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');

    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: new Date() })}\n\n`);

    const interval = setInterval(() => {
      reply.raw.write(`event: ping\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
    }, 15000);

    req.raw.on('close', () => {
      clearInterval(interval);
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
