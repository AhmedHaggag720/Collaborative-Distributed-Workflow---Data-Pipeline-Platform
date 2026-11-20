# ADR 004: Redis Pub/Sub + SSE and TimescaleDB for Streaming Observability

## Context & Problem Statement
FlowMesh requires streaming live execution status, node runtimes, logs, and latency percentiles (p50/p95/p99) onto the visual canvas within $< 200\text{ms}$ of step execution, while simultaneously retaining historical telemetry for post-mortem auditing and analytical aggregation.

## Decision Drivers
* Sub-second live updates delivered to browser canvases without polling.
* High ingestion throughput for step-level metrics and logs without degrading control-plane API response times.
* Efficient time-series aggregation for percentile latencies.

## Considered Options
1. **Direct HTTP Polling:** Frontend polls `/api/runs/:id` every 500ms.
2. **Kafka + ClickHouse:** Distributed event log and columnar OLAP database.
3. **Redis Pub/Sub + Server-Sent Events (SSE) + TimescaleDB Hypertables:** Event streaming pipeline with relational time-series storage.

## Decision Outcome
Chosen option: **Redis Pub/Sub + Server-Sent Events (SSE) + TimescaleDB**, because:
- **Zero-Latency Push via SSE:** When a worker finishes a step, it publishes a telemetry packet to `flowmesh:telemetry:events` over Redis. API nodes subscribed to this channel forward events over persistent SSE streams directly to connected browsers in $< 50\text{ms}$.
- **Unidirectional Simplicity:** SSE is simpler than bidirectional WebSockets for control-plane event telemetry, traverses corporate firewalls effortlessly, and reconnects with native browser event handlers.
- **TimescaleDB Chunk Partitioning:** High-volume telemetry logs are partitioned into time-series hypertables, supporting fast analytical rollup of p50, p95, and p99 node latencies without index bloat.
- **Trace & Span Correlation:** Distributed steps carry W3C-compatible `traceId` (16 bytes) and `spanId` (8 bytes) that link upstream trigger events to downstream children across async hops.

## Consequences
- Requires Redis instance for real-time pub/sub distribution.
- Telemetry writes must be asynchronous or batched to avoid adding latency to worker task leasing.
