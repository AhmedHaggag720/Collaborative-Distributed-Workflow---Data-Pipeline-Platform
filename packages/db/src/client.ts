import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
import * as dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL || 'postgresql://flowmesh:flowmesh_secret@localhost:5432/flowmesh';
const telemetryDatabaseUrl = process.env.TELEMETRY_DATABASE_URL || 'postgresql://flowmesh_telemetry:flowmesh_telemetry_secret@localhost:5433/flowmesh_telemetry';

export const primaryPool = new Pool({
  connectionString: databaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const telemetryPool = new Pool({
  connectionString: telemetryDatabaseUrl,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

export const db = drizzle(primaryPool, { schema });
export const telemetryDb = drizzle(telemetryPool, { schema });
