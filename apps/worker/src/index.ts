import os from 'os';
import * as dotenv from 'dotenv';
import { db, executionSteps, executionRuns, workflows, workerHeartbeats, eq, and, sql } from '@flowmesh/db';
import { executeInSandbox } from '@flowmesh/sandbox';
import { areDependenciesSatisfied, getDownstreamNodes } from '@flowmesh/dag-engine';

dotenv.config();

const workerId = `worker-${os.hostname()}-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
let isRunning = true;

console.log(`[Worker Fleet] Starting FlowMesh worker node: ${workerId}`);

// Heartbeat updater
async function startHeartbeatLoop() {
  while (isRunning) {
    try {
      await db
        .insert(workerHeartbeats)
        .values({
          workerId,
          hostname: os.hostname(),
          status: 'active',
          activeJobsCount: 0,
          cpuPercent: os.loadavg()[0]?.toFixed(2) || '0',
          memoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          lastHeartbeat: new Date(),
        })
        .onConflictDoUpdate({
          target: workerHeartbeats.workerId,
          set: {
            lastHeartbeat: new Date(),
            cpuPercent: os.loadavg()[0]?.toFixed(2) || '0',
            memoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          },
        });
    } catch {
      // Ignore initial DB connection wait
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
}

// Lease step using SKIP LOCKED
async function leaseNextStep() {
  try {
    const leaseDurationSeconds = 60;
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseDurationSeconds * 1000);

    // PostgreSQL SKIP LOCKED query
    const result = await db.execute(sql`
      UPDATE execution_steps
      SET 
        status = 'leased',
        worker_id = ${workerId},
        leased_at = ${now},
        leased_until = ${leaseUntil},
        started_at = COALESCE(started_at, ${now}),
        updated_at = ${now}
      WHERE id = (
        SELECT id
        FROM execution_steps
        WHERE status IN ('queued', 'retrying')
          OR (status = 'leased' AND leased_until < ${now})
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `);

    const step = (result.rows?.[0] as any);
    return step || null;
  } catch {
    return null;
  }
}

// Execute single leased step
async function executeStep(step: any) {
  console.log(`[Worker ${workerId}] Leased step ${step.id} for node ${step.node_id}`);

  // Fetch parent workflow run and workflow DAG
  const [run] = await db.select().from(executionRuns).where(eq(executionRuns.id, step.run_id));
  if (!run) return;

  const [workflow] = await db.select().from(workflows).where(eq(workflows.id, run.workflowId));
  if (!workflow) return;

  const nodes = workflow.nodes as any[];
  const edges = workflow.edges as any[];
  const node = nodes.find((n) => n.id === step.node_id);

  if (!node) {
    await db
      .update(executionSteps)
      .set({
        status: 'failed',
        error: `Node ${step.node_id} not found in workflow definition.`,
        completedAt: new Date(),
      })
      .where(eq(executionSteps.id, step.id));
    return;
  }

  const startTime = Date.now();
  let outputPayload: any = null;
  let errorMsg: string | null = null;
  let logs: string[] = [];

  try {
    if (node.type === 'js_code_transform') {
      const code = node.data?.config?.code || 'return input;';
      const res = await executeInSandbox(code, step.input_payload || {});
      logs = res.logs;
      if (res.success) {
        outputPayload = res.output;
      } else {
        throw new Error(res.error || 'Code transformation failed');
      }
    } else if (node.type === 'http_request') {
      const config = node.data?.config || {};
      const url = config.url;
      logs.push(`Dispatching HTTP ${config.method || 'GET'} to ${url}`);
      // Standard HTTP fetch
      try {
        const resp = await fetch(url, {
          method: config.method || 'GET',
          headers: config.headers || {},
          body: config.method !== 'GET' ? JSON.stringify(step.input_payload) : undefined,
        });
        const body = await resp.text();
        outputPayload = { status: resp.status, body: body.slice(0, 1000) };
      } catch (httpErr) {
        throw new Error(`HTTP request failed: ${(httpErr as Error).message}`);
      }
    } else {
      // Pass-through for triggers, timers, branches
      outputPayload = step.input_payload;
    }

    const durationMs = Date.now() - startTime;

    // Mark step completed
    await db
      .update(executionSteps)
      .set({
        status: 'completed',
        outputPayload,
        durationMs,
        logs,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(executionSteps.id, step.id));

    console.log(`[Worker ${workerId}] Step ${step.id} completed successfully in ${durationMs}ms`);

    // Check downstream nodes
    const downstreamIds = getDownstreamNodes(step.node_id, edges);
    if (downstreamIds.length > 0) {
      // Find all completed steps for this run
      const completedSteps = await db
        .select()
        .from(executionSteps)
        .where(and(eq(executionSteps.runId, step.run_id), eq(executionSteps.status, 'completed')));

      const completedNodeIds = new Set(completedSteps.map((s) => s.nodeId));
      completedNodeIds.add(step.node_id);

      for (const nextNodeId of downstreamIds) {
        if (areDependenciesSatisfied(nextNodeId, edges, completedNodeIds)) {
          // Enqueue next step
          await db.insert(executionSteps).values({
            runId: step.run_id,
            nodeId: nextNodeId,
            status: 'queued',
            inputPayload: outputPayload,
          });
        }
      }
    } else {
      // Check if all steps in run are completed
      const allSteps = await db
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.runId, step.run_id));

      const isAllDone = allSteps.every((s) => s.status === 'completed');
      if (isAllDone) {
        await db
          .update(executionRuns)
          .set({
            status: 'completed',
            completedAt: new Date(),
          })
          .where(eq(executionRuns.id, step.run_id));
        console.log(`[Worker ${workerId}] Workflow run ${step.run_id} completed successfully!`);
      }
    }
  } catch (err) {
    errorMsg = (err as Error).message;
    console.error(`[Worker ${workerId}] Step ${step.id} failed: ${errorMsg}`);

    await db
      .update(executionSteps)
      .set({
        status: step.attempt >= step.max_attempts ? 'dlq' : 'failed',
        error: errorMsg,
        logs,
        completedAt: new Date(),
      })
      .where(eq(executionSteps.id, step.id));
  }
}

// Main execution loop
async function startWorkerLoop() {
  while (isRunning) {
    const step = await leaseNextStep();
    if (step) {
      await executeStep(step);
    } else {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

// Start services
startHeartbeatLoop();
startWorkerLoop();

process.on('SIGINT', () => {
  console.log(`[Worker ${workerId}] Gracefully shutting down...`);
  isRunning = false;
  process.exit(0);
});
