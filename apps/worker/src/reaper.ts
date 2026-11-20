import { db, executionSteps, workerHeartbeats, sql, eq } from '@flowmesh/db';

/**
 * The Reaper process identifies crashed or terminated workers (heartbeat timed out > 25s)
 * and safely reclaims their leased execution steps by resetting them to 'queued' or 'retrying'.
 */
export async function runReaperSweep(): Promise<number> {
  try {
    const deadThresholdSeconds = 25;
    const now = new Date();
    const deadTime = new Date(now.getTime() - deadThresholdSeconds * 1000);

    // Find workers that stopped sending heartbeats
    const deadWorkers = await db.execute(sql`
      SELECT worker_id
      FROM worker_heartbeats
      WHERE last_heartbeat < ${deadTime}
        AND status = 'active';
    `);

    const deadWorkerIds = (deadWorkers.rows || []).map((r: any) => r.worker_id);

    if (deadWorkerIds.length > 0) {
      // Mark dead workers as inactive
      for (const dwId of deadWorkerIds) {
        await db
          .update(workerHeartbeats)
          .set({ status: 'dead' })
          .where(eq(workerHeartbeats.workerId, dwId));
      }
      console.log(`[Reaper] Identified ${deadWorkerIds.length} dead worker node(s):`, deadWorkerIds.join(', '));
    }

    // Reclaim orphaned jobs leased by dead workers OR whose lease expired
    const reclaimed = await db.execute(sql`
      UPDATE execution_steps
      SET 
        status = 'queued',
        worker_id = NULL,
        leased_at = NULL,
        leased_until = NULL,
        attempt = attempt + 1,
        updated_at = ${now}
      WHERE (
        status = 'leased' AND (
          leased_until < ${now}
          OR worker_id IN (SELECT worker_id FROM worker_heartbeats WHERE status = 'dead')
        )
      )
      RETURNING id, node_id, worker_id;
    `);

    const count = reclaimed.rows?.length || 0;
    if (count > 0) {
      console.log(`[Reaper] Successfully reclaimed ${count} orphaned execution step(s) into queue:`);
      for (const row of reclaimed.rows as any[]) {
        console.log(`  - Step ${row.id} (node: ${row.node_id}) recovered from worker ${row.worker_id || 'unknown'}`);
      }
    }

    return count;
  } catch (err) {
    // Database transient error handled gracefully
    return 0;
  }
}
