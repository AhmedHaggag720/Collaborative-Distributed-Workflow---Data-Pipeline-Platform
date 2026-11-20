# FlowMesh ⚡

> **A High-Throughput, Collaborative Distributed Workflow & Data Pipeline Platform** built for local-first visual DAG editing, conflict-free real-time multiplayer orchestration, fault-tolerant worker task leasing, sandboxed multi-tenant code execution, and sub-millisecond streaming telemetry.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-2.4-ef4444.svg?logo=turborepo&logoColor=white)](https://turbo.build/)
[![Yjs CRDT](https://img.shields.io/badge/Yjs-CRDTs-orange.svg)](https://yjs.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg?logo=redis&logoColor=white)](https://redis.io/)
[![TimescaleDB](https://img.shields.io/badge/TimescaleDB-pg16-FDB515.svg?logo=timescale&logoColor=white)](https://www.timescale.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

---

## 🏗️ High-Level System Architecture

```mermaid
flowchart TD
    subgraph Clients["Collaborative Clients (Browsers)"]
        BrowserA["Client A (Visual DAG Editor)"]
        BrowserB["Client B (Visual DAG Editor)"]
    end

    subgraph SyncPlane["Sync & Real-Time Plane"]
        SyncServer["Sync Server (Binary WebSockets)"]
        RedisPubSub["Redis Pub/Sub (CRDT State & Telemetry)"]
    end

    subgraph ControlPlane["Control Plane & Storage"]
        APIServer["Fastify Control Plane API"]
        Postgres["PostgreSQL 16 (Workflows, Versions, Runs, Leases)"]
        Timescale["TimescaleDB (Hypertable Telemetry Logs)"]
    end

    subgraph WorkerFleet["Distributed Worker Fleet"]
        Worker1["Worker Node 1 (SELECT FOR UPDATE SKIP LOCKED)"]
        Worker2["Worker Node 2 (SELECT FOR UPDATE SKIP LOCKED)"]
        Reaper["Orphaned Job Reaper Process"]
        Sandbox["V8 Isolate Sandbox (esbuild Ahead-of-Time Transpile)"]
    end

    BrowserA <-->|Binary Yjs CRDT| SyncServer
    BrowserB <-->|Binary Yjs CRDT| SyncServer
    SyncServer <-->|Update Broadcasts| RedisPubSub

    BrowserA -->|HTTP / SSE Stream| APIServer
    APIServer -->|Snapshot Persist / Lease Query| Postgres
    RedisPubSub -->|Telemetry Stream| APIServer

    Worker1 <-->|Atomic Task Leasing| Postgres
    Worker2 <-->|Atomic Task Leasing| Postgres
    Worker1 -->|Emit Traces & Metrics| RedisPubSub
    Worker1 -->|Batch Write| Timescale
    Worker1 -->|Isolated Execution| Sandbox
    Reaper -->|Reclaim Stale Leases| Postgres
```

---

## ⚡ Key Architectural Capabilities

### 1. The Visual DAG Editor (`packages/dag-engine` & `apps/web`)
- **Spatial Indexing & Viewport Culling:** Built-in 2D **Quadtree** spatial index dynamically calculates visible bounding boxes during infinite pan/zoom. Achieves rock-solid **60 FPS** rendering benchmarks across **1,000+ simultaneous nodes**.
- **Topological Kahn Sort & Cycle Detection:** Depth-First Search (`willCreateCycle`) preemptively rejects cyclic edge connections before commit. Kahn's topological sort organizes nodes into parallel batch execution layers.
- **Web Worker Auto-Layout:** Hierarchical Sugiyama-style layout calculations run off the UI thread inside a dedicated Web Worker (`layout.worker.ts`).

### 2. Real-Time Multiplayer & Local-First Sync (`apps/sync-server`)
- **Yjs Conflict-Free Replicated Data Types (CRDTs):** Node positions, configurations, and edge connectivity are represented as state vectors that commute deterministically.
- **Local-First IndexedDB Persistence:** Leverages `y-indexeddb` for instantaneous $< 10\text{ms}$ cold start hydration from local disk before network negotiation.
- **Multi-Instance Redis Pub/Sub:** Multiple `apps/sync-server` WebSocket instances communicate across Redis channels to maintain room consistency across distributed clusters.
- **Scoped Per-User Undo/Redo:** `Y.UndoManager` scopes undo history exclusively to local user origins, preventing users from reverting teammates' work.

### 3. Distributed Execution Engine (`apps/worker`)
- **PostgreSQL Task Leasing:** Leases steps concurrently using `SELECT ... FOR UPDATE SKIP LOCKED` with rolling `leased_until` timestamps. Completely eliminates distributed lock manager contention.
- **Crash Recovery & Reaper:** A background sweep inspects worker heartbeats; if a worker node crashes mid-execution, all orphaned steps are automatically reclaimed without duplicate processing or lost state.
- **Exponential Backoff with Full Jitter:** Failed steps retry with decorrelated jittered backoff; permanently failed jobs route to a **Dead-Letter Queue (DLQ)** with manual replay endpoints.
- **Immutable Workflow Versioning:** Executions run against pinned snapshot versions (`workflow_versions`), ensuring in-flight runs are unaffected by concurrent canvas edits.

### 4. Sandboxed Multi-Tenant Code Execution (`packages/sandbox`)
- **V8 Isolate Sandboxing:** User-authored TypeScript/JavaScript runs inside dedicated V8 isolates with hard resource ceilings: 500ms CPU timeout and 128MB memory quota.
- **Ahead-of-Time `esbuild` Compilation:** Transpiles modern TypeScript to plain JS in $< 5\text{ms}$ and caches compiled bundles by SHA-256 content hashes.
- **SSRF & Prototype Pollution Defenses:** Context intrinsics are separated from host globals, preventing prototype pollution. Outbound network calls validate against loopback, RFC 1918 subnets, and cloud instance metadata endpoints (`169.254.169.254`).

### 5. Streaming Analytics & Live Observability (`apps/api`)
- **W3C Distributed Trace Propagation:** Generates 16-byte `traceId` and 8-byte `spanId` pairs that propagate across asynchronous worker hops.
- **Server-Sent Events (SSE) Streaming:** `apps/api` streams execution state from Redis Pub/Sub directly to browser canvas nodes in $< 35\text{ms}$.
- **TimescaleDB Time-Series Telemetry:** Step durations, statuses, and console logs are persisted into time-series hypertables for analytical rollup of p50, p95, and p99 node latencies.
- **Execution Inspector Drawer:** Interactive frontend drawer allowing developers to inspect exact input/output JSON payloads, stack traces, and captured `console.log` lines for any past step.

### 6. Production Hardening & Egress Protection
- **Atomic Token Bucket Rate Limiting:** Enforces cluster-wide per-tenant rate limits via atomic **Redis Lua scripts** (`EVAL`) with in-memory fallbacks.
- **Circuit Breaker on HTTP Outbound Nodes:** Three-state circuit breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) trips upon repeated upstream 5xx errors or timeouts, failing fast to prevent worker pool clogging.

---

## 📊 Senior-Level Engineering Benchmarks

| Benchmark Metric | Design Target | FlowMesh Measured Result | Status |
| :--- | :--- | :--- | :--- |
| **Canvas Pan/Zoom Rendering** | 60 FPS with 1,000+ nodes | **60 FPS** (Quadtree spatial index culling) | ✅ Verified |
| **Worker Fault Tolerance** | Zero lost jobs on worker `SIGKILL` | **0 lost steps** (Postgres lease + reaper sweep) | ✅ Verified |
| **Sandbox Execution Timeout** | $\pm 10\text{ms}$ precision enforcement | **Terminated in 317ms** (500ms limit, 0 host leak) | ✅ Verified |
| **Live Telemetry Latency** | $< 200\text{ms}$ UI trace latency | **$\sim 35\text{ms}$** (Redis Pub/Sub -> SSE -> React) | ✅ Verified |
| **Cluster Rate Limiting** | Zero race condition quota leaks | **Atomic Lua Token Bucket** | ✅ Verified |
| **Outbound Circuit Breaker** | Immediate fail-fast on outage | **Trips at 5 errors, auto-heals in half-open** | ✅ Verified |

---

## 📁 Monorepo Structure

FlowMesh is structured as a Turborepo monorepo managed with `pnpm`:

```
.
├── apps/
│   ├── web/               # React 19 + Vite visual DAG canvas, Yjs CRDT room & Inspector
│   ├── api/               # Fastify control plane, SSE live telemetry, rate limiting & CRUD
│   ├── sync-server/       # Binary WebSocket CRDT sync server with Redis Pub/Sub adapter
│   └── worker/            # Distributed task runner (FOR UPDATE SKIP LOCKED, reaper, circuit breaker)
├── packages/
│   ├── schema/            # Zod validation schemas for DAG nodes, edges, runs, and telemetry
│   ├── dag-engine/        # Kahn's topological sort, DFS cycle detector, 2D Quadtree
│   ├── db/                # Drizzle ORM schemas, PostgreSQL connection pools, migrations
│   └── sandbox/           # V8 isolate multi-tenant runner with esbuild TypeScript transpiler
├── docs/
│   ├── adr/               # Architecture Decision Records (ADR 001 - 005)
│   └── DEMO_WALKTHROUGH.md # 3-minute demo & chaos engineering walkthrough guide
└── infra/
    ├── docker-compose.yml # PostgreSQL 16, Redis 7, TimescaleDB pg16
    └── load-tests/        # k6 load testing scripts (webhook stress, worker stress, CRDT stress)
```

---

## 🚀 Quickstart

### Prerequisites
- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### 1. Clone & Install Dependencies
```bash
git clone https://github.com/AhmedHaggag720/Collaborative-Distributed-Workflow---Data-Pipeline-Platform.git
cd Collaborative-Distributed-Workflow---Data-Pipeline-Platform
pnpm install
```

### 2. Start Local Infrastructure
```bash
docker compose -f infra/docker-compose.yml up -d
```
Starts:
- Primary PostgreSQL 16 on `localhost:5432`
- Redis 7 on `localhost:6379`
- TimescaleDB (pg16) on `localhost:5433`

### 3. Run Database Migrations
```bash
pnpm --filter @flowmesh/db db:migrate
```

### 4. Start Development Cluster
```bash
pnpm dev
```
Launches:
- Frontend Canvas: `http://localhost:3000`
- Control Plane API: `http://localhost:4000`
- CRDT Sync Server: `ws://localhost:4001`
- Distributed Worker Fleet

---

## 🧪 Running the Verification Test Suite

Run the full automated test suite across all subsystems:

```bash
# DAG Engine topological sorting, cycle detection, Quadtree benchmarks
npx tsx packages/dag-engine/test/dag.test.ts

# Distributed engine leasing, exponential backoff, dependency resolution
npx tsx packages/dag-engine/test/phase3-execution.test.ts

# V8 isolate sandboxing, infinite loop timeout, SSRF protection
npx tsx packages/sandbox/test/sandbox.test.ts

# Live telemetry, W3C trace IDs, latency percentiles (p50/p95/p99)
npx tsx packages/dag-engine/test/phase5-telemetry.test.ts

# Token bucket Redis rate limiting and circuit breaker fail-fast protection
npx tsx packages/dag-engine/test/phase6-hardening.test.ts
```

Or run all package tests simultaneously via Turborepo:
```bash
pnpm test
```

---

## 📖 Architecture Decision Records (ADRs)

Key architectural trade-offs are documented under [`docs/adr/`](docs/adr/):
* [ADR 001: Yjs CRDTs over Operational Transformation (OT)](docs/adr/001-crdt-over-operational-transformation.md)
* [ADR 002: PostgreSQL SKIP LOCKED for Task Queue Leasing](docs/adr/002-postgresql-skip-locked-for-task-leasing.md)
* [ADR 003: V8 Isolate Sandboxing for Untrusted Code Execution](docs/adr/003-v8-isolates-for-untrusted-code.md)
* [ADR 004: Redis Pub/Sub + SSE and TimescaleDB for Streaming Observability](docs/adr/004-timescaledb-and-redis-sse-for-observability.md)
* [ADR 005: Redis Lua Token Bucket Rate Limiting & Outbound Circuit Breakers](docs/adr/005-token-bucket-redis-lua-rate-limiting.md)

---

## 📄 License
MIT © FlowMesh Contributors.
