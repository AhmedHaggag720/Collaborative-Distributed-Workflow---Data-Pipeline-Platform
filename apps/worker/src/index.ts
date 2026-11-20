import os from 'os';
import * as dotenv from 'dotenv';
import { db, executionSteps, executionRuns, workflows, workflowVersions, workerHeartbeats, eq, and, sql } from '@flowmesh/db';
import { executeInSandbox } from '@flowmesh/sandbox';
import { areDependenciesSatisfied, getDownstreamNodes } from '@flowmesh/dag-engine';
import { calculateExponentialBackoffWithJitter } from './backoff.js';
import { runReaperSweep } from './reaper.js';

dotenv.config();

const workerId = `worker-${os.hostname()}-${process.pid}-${Math.random().toString(36).substring(2, 7)}`;
let isRunning = true;
let activeJobs = 0;

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
          activeJobsCount: activeJobs,
          cpuPercent: os.loadavg()[0]?.toFixed(2) || '0',
          memoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          lastHeartbeat: new Date(),
        })
        .onConflictDoUpdate({
          target: workerHeartbeats.workerId,
          set: {
            status: 'active',
            activeJobsCount: activeJobs,
            lastHeartbeat: new Date(),
            cpuPercent: os.loadavg()[0]?.toFixed(2) || '0',
            memoryUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
          },
        });
    } catch {
      // Ignore initial DB connection wait
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
}

// Reaper loop: checks for crashed workers and reclaims orphaned steps every 10s
async function startReaperLoop() {
  while (isRunning) {
    try {
      await runReaperSweep();
    } catch {
      // Ignore transient errors
    }
    await new Promise((r) => setTimeout(r, 10000));
  }
}

// Concurrent Task Leasing using PostgreSQL FOR UPDATE SKIP LOCKED
async function leaseNextStep() {
  try {
    const leaseDurationSeconds = 45;
    const now = new Date();
    const leaseUntil = new Date(now.getTime() + leaseDurationSeconds * 1000);

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
        WHERE status = 'queued'
           OR (status = 'retrying' AND leased_until <= ${now})
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING *;
    `);

    const step = result.rows?.[0] as any;
    return step || null;
  } catch {
    return null;
  }
}

// Execute single leased step with full error handling and DLQ routing
async function executeStep(step: any) {
  activeJobs++;
  console.log(`[Worker ${workerId}] Leased step ${step.id} for node [${step.node_id}] (Attempt ${step.attempt}/${step.max_attempts})`);

  // Fetch parent workflow run and workflow definition
  const [run] = await db.select().from(executionRuns).where(eq(executionRuns.id, step.run_id));
  if (!run) {
    activeJobs--;
    return;
  }

  // Load workflow nodes and edges (either from published version snapshot or draft)
  let nodes: any[] = [];
  let edges: any[] = [];

  if (run.workflowVersionId) {
    const [version] = await db
      .select()
      .from(workflowVersions)
      .where(eq(workflowVersions.id, run.workflowVersionId));
    if (version) {
      nodes = (version.snapshot as any).nodes || [];
      edges = (version.snapshot as any).edges || [];
    }
  }

  if (nodes.length === 0) {
    const [workflow] = await db.select().from(workflows).where(eq(workflows.id, run.workflowId));
    if (workflow) {
      nodes = (workflow.nodes as any[]) || [];
      edges = (workflow.edges as any[]) || [];
    }
  }

  const node = nodes.find((n) => n.id === step.node_id);

  if (!node) {
    await db
      .update(executionSteps)
      .set({
        status: 'failed',
        error: `Node ${step.node_id} not found in workflow definition.`,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(executionSteps.id, step.id));
    activeJobs--;
    return;
  }

  const startTime = Date.now();
  let outputPayload: any = null;
  let errorMsg: string | null = null;
  let logs: string[] = [];
  let activeBranchPort: string | null = null;

  try {
    const inputData = step.input_payload || {};

    if (node.type === 'js_code_transform') {
      const code = node.data?.config?.code || 'return input;';
      const res = await executeInSandbox(code, inputData, {
        timeoutMs: node.data?.config?.timeoutMs || 500,
        memoryLimitMb: node.data?.config?.memoryLimitMb || 128,
      });
      logs = res.logs;
      if (res.success) {
        outputPayload = res.output;
      } else {
        throw new Error(res.error || 'Code transformation failed');
      }
    } else if (node.type === 'http_request') {
      const config = node.data?.config || {};
      const url = config.url;
      logs.push(`[HTTP] Dispatching ${config.method || 'GET'} to ${url}`);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 8000);

      try {
        const resp = await fetch(url, {
          method: config.method || 'GET',
          headers: config.headers || { 'Content-Type': 'application/json' },
          body: config.method !== 'GET' ? JSON.stringify(inputData) : undefined,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const text = await resp.text();
        outputPayload = { status: resp.status, body: text.slice(0, 2000) };
        logs.push(`[HTTP] Response status: ${resp.status}`);
      } catch (httpErr) {
        clearTimeout(timeout);
        throw new Error(`HTTP dispatch failed: ${(httpErr as Error).message}`);
      }
    } else if (node.type === 'conditional_branch') {
      const expr = node.data?.config?.conditionExpression || 'return Boolean(input);';
      logs.push(`[Branch] Evaluating condition: ${expr}`);
      try {
        const branchFn = new Function('input', expr);
        const isTrue = Boolean(branchFn(inputData));
        activeBranchPort = isTrue 
          ? (node.data?.config?.trueBranchPortId || 'true')
          : (node.data?.config?.falseBranchPortId || 'false');
        outputPayload = { branch: activeBranchPort, input: inputData };
        logs.push(`[Branch] Condition result: ${isTrue} -> routed to port: ${activeBranchPort}`);
      } catch (branchErr) {
        throw new Error(`Branch evaluation failed: ${(branchErr as Error).message}`);
      }
    } else if (node.type === 'delay_timer') {
      const delayMs = node.data?.config?.delayMs || 1000;
      const jitter = node.data?.config?.jitter ? Math.random() * 500 : 0;
      const totalDelay = Math.round(delayMs + jitter);
      logs.push(`[Timer] Pausing execution for ${totalDelay}ms`);
      await new Promise((r) => setTimeout(r, totalDelay));
      outputPayload = inputData;
    } else {
      // Webhook trigger or pass-through node
      outputPayload = inputData;
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

    // Downstream resolution (Fan-out / Fan-in)
    // Filter outgoing edges if this was a conditional branch
    const outgoingEdges = edges.filter((e) => {
      if (e.sourceNodeId !== step.node_id) return false;
      if (activeBranchPort && e.sourcePortId !== activeBranchPort) return false;
      return true;
    });

    const downstreamNodeIds = Array.from(new Set(outgoingEdges.map((e) => e.targetNodeId)));

    if (downstreamNodeIds.length > 0) {
      // Find all completed steps for this execution run
      const completedSteps = await db
        .select()
        .from(executionSteps)
        .where(and(eq(executionSteps.runId, step.run_id), eq(executionSteps.status, 'completed')));

      const completedNodeIds = new Set(completedSteps.map((s) => s.nodeId));
      completedNodeIds.add(step.node_id);

      for (const nextNodeId of downstreamNodeIds) {
        if (areDependenciesSatisfied(nextNodeId, edges, completedNodeIds)) {
          await db.insert(executionSteps).values({
            runId: step.run_id,
            nodeId: nextNodeId,
            status: 'queued',
            inputPayload: outputPayload,
          });
          console.log(`[Worker ${workerId}] Enqueued child step for node [${nextNodeId}]`);
        }
      }
    } else {
      // Check if all steps in this execution run are finished
      const allSteps = await db
        .select()
        .from(executionSteps)
        .where(eq(executionSteps.runId, step.run_id));

      const isAllDone = allSteps.every((s) => s.status === 'completed' || s.status === 'skipped');
      if (isAllDone) {
        const runDurationMs = Date.now() - (run.startedAt ? new Date(run.startedAt).getTime() : Date.now());
        await db
          .update(executionRuns)
          .set({
            status: 'completed',
            durationMs: runDurationMs,
            completedAt: new Date(),
          })
          .where(eq(executionRuns.id, step.run_id));
        console.log(`[Worker ${workerId}] Workflow run ${step.run_id} completed successfully in ${runDurationMs}ms!`);
      }
    }
  } catch (err) {
    errorMsg = (err as Error).message;
    console.error(`[Worker ${workerId}] Step ${step.id} encountered error: ${errorMsg}`);

    const nextAttempt = step.attempt + 1;
    if (nextAttempt <= step.max_attempts) {
      // Exponential backoff with full jitter
      const retryDelayMs = calculateExponentialBackoffWithJitter(step.attempt);
      const retryAt = new Date(Date.now() + retryDelayMs);

      await db
        .update(executionSteps)
        .set({
          status: 'retrying',
          attempt: nextAttempt,
          workerId: null,
          leasedUntil: retryAt,
          error: errorMsg,
          logs: [...logs, `[Retry Scheduled] Attempt ${nextAttempt}/${step.max_attempts} in ${retryDelayMs}ms`],
          updatedAt: new Date(),
        })
        .where(eq(executionSteps.id, step.id));

      console.log(`[Worker ${workerId}] Step ${step.id} scheduled for retry ${nextAttempt}/${step.max_attempts} at ${retryAt.toISOString()}`);
    } else {
      // Permanently failed: route to Dead-Letter Queue (DLQ)
      await db
        .update(executionSteps)
        .set({
          status: 'dlq',
          error: errorMsg,
          logs: [...logs, `[DLQ] Exceeded maximum attempts (${step.max_attempts}). Moved to Dead-Letter Queue.`],
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(executionSteps.id, step.id));

      // Mark parent run as failed
      await db
        .update(executionRuns)
        .set({
          status: 'failed',
          error: `Step ${step.node_id} failed permanently: ${errorMsg}`,
          completedAt: new Date(),
        })
        .where(eq(executionRuns.id, step.run_id));

      console.warn(`[Worker ${workerId}] Step ${step.id} routed to DLQ! Parent run ${step.run_id} marked as failed.`);
    }
  } finally {
    activeJobs--;
  }
}

// Main execution loop
async function startWorkerLoop() {
  while (isRunning) {
    const step = await leaseNextStep();
    if (step) {
      await executeStep(step);
    } else {
      await new Promise((r) => setTimeout(r, 600));
    }
  }
}

// Start background processes
startHeartbeatLoop();
startReaperLoop();
startWorkerLoop();

process.on('SIGINT', () => {
  console.log(`[Worker ${workerId}] Gracefully shutting down...`);
  isRunning = false;
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(`[Worker ${workerId}] Terminating...`);
  isRunning = false;
  process.exit(0);
});
