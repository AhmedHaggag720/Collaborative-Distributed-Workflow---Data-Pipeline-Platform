# FlowMesh — Collaborative Distributed Workflow & Data Pipeline Platform

A local-first, multiplayer visual workflow engine built end-to-end in TypeScript. Engineers collaborate in real time on an infinite node-based canvas to wire triggers, custom sandboxed JavaScript transformations, and API sinks—then deploy those pipelines onto a fault-tolerant distributed worker fleet with live telemetry streaming back onto the graph.

---

## High-Level Architecture

```text
                       ┌──────────────────────────────────────────┐
                       │         Web Client (React / TS)          │
                       │  [Canvas DAG]  [Yjs CRDT]  [IndexedDB]   │
                       └─────┬──────────────────────────────▲─────┘
                             │ WebSockets (CRDT)            │ SSE (Live Telemetry)
                             ▼                              │
┌──────────────────────────────────────┐    ┌───────────────┴──────────────────────┐
│    Sync & Control Plane (Fastify)    │    │    Telemetry & Observability API     │
│  • Yjs WebSocket Gateway             │    │  • Real-time execution status stream │
│  • Workflow Versioning & Auth        │    │  • Per-node p95/p99 latency queries  │
│  • Webhook Trigger Ingestion         │    └───────────────▲──────────────────────┘
└────────┬────────────────────┬────────┘                    │
         │                    │                             │
         ▼                    ▼                             │
┌──────────────────┐  ┌──────────────────┐         ┌────────┴─────────┐
│  Redis Cluster   │  │    PostgreSQL    │         │  ClickHouse /    │
│ • Pub/Sub (Sync) │  │ • Workflow DAGs  │         │  TimescaleDB     │
│ • Lua Rate Limit │  │ • Event Log      │         │ • Execution Logs │
│ • Heartbeats     │  │ • Job Leasing    │         │ • OTel Traces    │
└────────▲─────────┘  └────────▲─────────┘         └────────▲─────────┘
         │                     │                            │
         └──────────┬──────────┴────────────────────────────┘
                    │ SKIP LOCKED Task Leasing
         ┌──────────▼────────────────────────────┐
         │   Distributed Worker Fleet (Node.js)  │
         │  • DAG Topological Runner             │
         │  • V8 Isolate Sandbox (isolated-vm)   │
         │  • Circuit Breakers & Retry/DLQ       │
         └───────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technologies |
| :--- | :--- |
| **Monorepo & Tooling** | TypeScript, pnpm Workspaces, Turborepo, Zod, Docker Compose |
| **Frontend & Canvas** | React / Next.js, HTML5 Canvas (or custom React Flow), Web Workers |
| **Multiplayer & Sync** | Yjs (CRDT), IndexedDB (`y-indexeddb`), `ws`, Redis Pub/Sub |
| **Backend & Orchestration** | Node.js, Fastify, PostgreSQL, Redis (Atomic Lua Scripts) |
| **Code Execution Sandbox** | `isolated-vm` (V8 Isolates), `esbuild` |
| **Observability & Testing** | OpenTelemetry, TimescaleDB / ClickHouse, Server-Sent Events (SSE), k6 |

---

## Recommended Monorepo Structure

```text
flowmesh/
├── apps/
│   ├── web/                 # Next.js / React infinite canvas & observability UI
│   ├── api/                 # Control plane REST API, Webhook ingress, SSE stream
│   ├── sync-server/         # Horizontally scalable Yjs WebSocket server
│   └── worker/              # Distributed execution engine + V8 isolate runner
├── packages/
│   ├── schema/              # Shared Zod schemas, DAG types, and event contracts
│   ├── dag-engine/          # Pure TS graph utilities (cycle detection, topo-sort)
│   ├── sandbox/             # isolated-vm wrapper + esbuild TS transpiler
│   └── db/                  # Database client, migrations, and SQL queries
├── infra/
│   ├── docker-compose.yml   # Postgres, Redis, TimescaleDB/ClickHouse, OTel Collector
│   └── load-tests/          # k6 scripts for stress-testing webhooks & workers
├── package.json
└── turbo.json
```

---

## Phased Implementation Roadmap

Follow these phases in order. Each phase ends with a concrete, verifiable milestone so you always have a working system.

### Phase 0: Foundation & Monorepo Setup
**Goal:** Establish a rock-solid developer experience with shared types and local infrastructure.
- [x] Initialize a `pnpm` workspace with `Turborepo` and strict `tsconfig.base.json`.
- [x] Create `infra/docker-compose.yml` spinning up PostgreSQL, Redis, and TimescaleDB (or ClickHouse).
- [x] Build `packages/schema` with Zod definitions for `Workflow`, `Node`, `Edge`, `ExecutionRun`, and `StepEvent`.
- [x] Set up database migrations (`Drizzle` or `Prisma` or raw SQL migrations) in `packages/db`.
- [x] **Milestone:** Running `docker compose up -d && pnpm dev` boots all services cleanly with shared hot-reloading types.

---

### Phase 1: The Visual DAG Editor (Frontend Systems)
**Goal:** Build a high-performance, interactive node-based editor in the browser.
- [x] Implement an infinite pan-and-zoom canvas (world-to-screen coordinate math + zoom-to-cursor).
- [x] Build core node types: **Webhook Trigger**, **HTTP Request**, **JS Code Transform**, **Conditional Branch**, and **Delay/Timer**.
- [x] Implement Bézier curve edge connections between input/output ports.
- [x] Build `packages/dag-engine` with real-time **cycle detection** (reject edges that create infinite loops) and **topological sorting**.
- [x] Add viewport culling and a Quadtree spatial index (or virtualized rendering) to maintain 60 FPS with 1,000+ nodes.
- [x] Offload auto-layout (e.g., Dagre/ELK) and JSON export calculations to a **Web Worker**.
- [x] **Milestone:** You can build, validate, pan/zoom, and export a complex branching workflow DAG smoothly in the browser.

---

### Phase 2: Real-Time Multiplayer & Local-First Sync
**Goal:** Turn the single-player editor into a Figma-like collaborative workspace that works offline.
- [x] Bind the DAG graph state (nodes, positions, edges, node configs) to a **Yjs** `Y.Doc` (`Y.Map` structures).
- [x] Wire up `y-indexeddb` so workflows load instantaneously from browser storage and remain editable offline.
- [x] Build `apps/sync-server` to sync Yjs updates over WebSockets and persist compacted binary snapshots to PostgreSQL.
- [x] Connect `apps/sync-server` instances via **Redis Pub/Sub** so users on different server instances stay in sync.
- [x] Add live multiplayer presence: colored user cursors, active node selection highlights, and per-user **Yjs UndoManager** (undoing only your own edits).
- [x] **Milestone:** Open two browser tabs (and kill the network in one); edit both simultaneously, reconnect, and watch changes merge without conflicts.

---

### Phase 3: Distributed Execution Engine (Backend Core)
**Goal:** Build a fault-tolerant worker fleet that executes deployed workflows reliably.
- [x] Implement workflow publishing/versioning (immutable snapshots of the DAG stored in PostgreSQL).
- [x] Build a Webhook Trigger endpoint (`POST /hooks/:workflowId`) that creates an `execution_run` and enqueues the root node(s).
- [x] Implement concurrent worker job leasing in PostgreSQL using `SELECT ... FOR UPDATE SKIP LOCKED` with lease expiration timestamps.
- [x] Build the DAG runner loop: when a node finishes, persist its output payload, check downstream dependencies (fan-out / fan-in), and enqueue ready child nodes.
- [x] Implement **worker heartbeats** and a **reaper process** that reclaims orphaned jobs if a worker process crashes mid-execution.
- [x] Add **exponential backoff with full jitter** for failed steps and route permanently failed jobs to a **Dead-Letter Queue (DLQ)** with a manual replay endpoint.
- [x] **Milestone:** Trigger 500 concurrent workflow runs across 3 running worker instances, `kill -9` one worker mid-run, and verify 100% of runs complete with zero lost steps.

---

### Phase 4: Sandboxed Multi-Tenant Code Execution
**Goal:** Safely execute untrusted user-written JavaScript/TypeScript inside "JS Code Transform" nodes.
- [x] Build `packages/sandbox` using `esbuild` to transpile user TypeScript to plain JS on the fly (cache compiled bundles by content hash).
- [x] Execute compiled code inside `isolated-vm` V8 isolates with strict guardrails:
  - Memory limit (e.g., `128 MB`)
  - CPU execution timeout (e.g., `500 ms`)
- [x] Expose a controlled, safe host bridge into the isolate (e.g., structured `console.log` capture and a rate-limited `fetch` wrapper).
- [x] Add a code editor panel (Monaco Editor) in the frontend for editing Code Nodes with input/output payload previews.
- [x] **Milestone:** Run a workflow containing an intentional `while(true) {}` infinite loop and an out-of-memory allocation; verify the isolate terminates cleanly while the worker continues processing other jobs unaffected.

---

### Phase 5: Streaming Analytics & Live Observability
**Goal:** Stream live execution traces and performance metrics directly onto the visual graph.
- [ ] Instrument `apps/api` and `apps/worker` with **OpenTelemetry** to propagate trace IDs across asynchronous worker hops.
- [ ] Ingest step-level execution logs, durations, and status codes into **TimescaleDB** or **ClickHouse** (batched writes for high throughput).
- [ ] Build a **Server-Sent Events (SSE)** endpoint in `apps/api` that subscribes to Redis Pub/Sub execution events and pushes live updates to the browser.
- [ ] Render live visual feedback directly on canvas nodes: pulsing active state, green/red completion badges, and real-time latency (p95) overlays.
- [ ] Build an Execution Inspector drawer allowing users to click any node in a past run to inspect its exact input/output JSON payloads and captured `console.log` lines.
- [ ] **Milestone:** Trigger a workflow and watch nodes light up in real time on the canvas as distributed workers process them, then click a failed node to inspect its stack trace and replay it.

---

### Phase 6: Production Hardening, Load Testing & Showcase
**Goal:** Prove system resilience under stress and polish the project for senior engineering reviews.
- [ ] Implement per-tenant **Token Bucket Rate Limiting** using atomic **Redis Lua scripts** on webhook ingress and outbound HTTP nodes.
- [ ] Add a **Circuit Breaker** for outbound HTTP nodes so a failing third-party API fails fast instead of clogging worker pools.
- [ ] Write `k6` load tests in `infra/load-tests/` to benchmark:
  - Webhook ingestion throughput (requests/sec)
  - End-to-end execution latency (p50, p95, p99)
  - WebSocket multiplayer sync latency under concurrent editors
- [ ] Document key architectural trade-offs (ADRs — Architecture Decision Records) in a `/docs` folder.
- [ ] Record a 3-minute architecture walkthrough & live demo (showing multiplayer editing + chaos worker kill + live telemetry).

---

## Senior-Level Engineering Benchmarks

Aim to hit and measure these concrete targets before calling the project complete:

- **Canvas Performance:** Smooth 60 FPS pan/zoom with 1,000+ nodes rendered.
- **Fault Tolerance:** Zero lost jobs and idempotent step execution when workers are randomly terminated (`SIGKILL`).
- **Sandbox Safety:** Untrusted code timeouts enforced within $\pm 10\text{ ms}$ with zero memory leaks across 10,000 sequential isolate runs.
- **Observability Latency:** Live node status updates appear on the browser canvas within $< 200\text{ ms}$ of worker completion.

---

## Local Development Quickstart

```bash
# 1. Install dependencies
pnpm install

# 2. Start local infrastructure (Postgres, Redis, TimescaleDB)
docker compose -f infra/docker-compose.yml up -d

# 3. Run database migrations
pnpm --filter @flowmesh/db migrate

# 4. Start all apps (Web, API, Sync Server, Workers) in parallel
pnpm dev
```