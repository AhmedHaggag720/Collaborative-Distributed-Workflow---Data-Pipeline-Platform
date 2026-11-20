import { primaryPool, telemetryPool } from './client.js';

export async function runMigrations() {
  console.log('Running database schema migrations for FlowMesh...');
  const client = await primaryPool.connect();

  try {
    await client.query(`
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

      CREATE TABLE IF NOT EXISTS workflows (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT DEFAULT '',
        version INTEGER NOT NULL DEFAULT 1,
        nodes JSONB NOT NULL DEFAULT '[]'::jsonb,
        edges JSONB NOT NULL DEFAULT '[]'::jsonb,
        viewport JSONB NOT NULL DEFAULT '{"x": 0, "y": 0, "zoom": 1}'::jsonb,
        is_published BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS workflow_versions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL,
        snapshot JSONB NOT NULL,
        published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        published_by VARCHAR(255)
      );

      CREATE TABLE IF NOT EXISTS execution_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        workflow_id UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        workflow_version_id UUID,
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        trigger_type VARCHAR(50) NOT NULL DEFAULT 'manual',
        trigger_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        context JSONB NOT NULL DEFAULT '{}'::jsonb,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS execution_steps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id UUID NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
        node_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'queued',
        attempt INTEGER NOT NULL DEFAULT 1,
        max_attempts INTEGER NOT NULL DEFAULT 3,
        worker_id VARCHAR(255),
        leased_at TIMESTAMPTZ,
        leased_until TIMESTAMPTZ,
        started_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        duration_ms INTEGER,
        input_payload JSONB,
        output_payload JSONB,
        error TEXT,
        logs JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_execution_steps_lease 
        ON execution_steps (status, leased_until) 
        WHERE status IN ('queued', 'retrying');

      CREATE INDEX IF NOT EXISTS idx_execution_steps_run_id 
        ON execution_steps (run_id);

      CREATE TABLE IF NOT EXISTS worker_heartbeats (
        worker_id VARCHAR(255) PRIMARY KEY,
        hostname VARCHAR(255) NOT NULL,
        status VARCHAR(50) NOT NULL DEFAULT 'active',
        active_jobs_count INTEGER NOT NULL DEFAULT 0,
        cpu_percent TEXT DEFAULT '0',
        memory_used_mb INTEGER NOT NULL DEFAULT 0,
        last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
    console.log('Primary PostgreSQL schema setup verified.');
  } finally {
    client.release();
  }

  // Telemetry schema
  try {
    const teleClient = await telemetryPool.connect();
    try {
      await teleClient.query(`
        CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

        CREATE TABLE IF NOT EXISTS telemetry_logs (
          id UUID DEFAULT gen_random_uuid(),
          event_type VARCHAR(100) NOT NULL,
          run_id UUID NOT NULL,
          workflow_id UUID NOT NULL,
          node_id VARCHAR(255),
          step_id UUID,
          status VARCHAR(50) NOT NULL,
          duration_ms INTEGER,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          payload JSONB,
          error TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_telemetry_workflow_run 
          ON telemetry_logs (workflow_id, run_id, timestamp DESC);
      `);
      console.log('Telemetry store schema setup verified.');
    } finally {
      teleClient.release();
    }
  } catch (err) {
    console.warn('Note: Telemetry database connection skipped (optional local container):', (err as Error).message);
  }
}

if (process.argv[1]?.endsWith('migrate.ts') || process.argv[1]?.endsWith('migrate.js')) {
  runMigrations()
    .then(() => {
      console.log('Migrations completed successfully.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}
