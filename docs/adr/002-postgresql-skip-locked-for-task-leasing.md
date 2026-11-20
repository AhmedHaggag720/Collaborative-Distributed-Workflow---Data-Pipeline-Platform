# ADR 002: PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED` for Task Leasing

## Context & Problem Statement
Distributed pipeline engines need a reliable, concurrent task queue that schedules independent steps across worker pools, prevents duplicate execution (at-most-once/at-least-once leasing), and survives worker process crashes without losing jobs.

## Decision Drivers
* Transactional atomicity between workflow state, step outputs, and lease transitions.
* Zero queue coordination lag and zero orphaned jobs.
* Operational simplicity: Avoid running a separate Kafka/RabbitMQ cluster in early-to-mid stage production environments.

## Considered Options
1. **Dedicated Message Brokers (RabbitMQ / Apache Kafka):** Decoupled streaming queues with consumer groups.
2. **Redis BullMQ / Redis Streams:** In-memory queue with Redis persistence.
3. **PostgreSQL `FOR UPDATE SKIP LOCKED`:** Relational row-level leasing with transactional step updates.

## Decision Outcome
Chosen option: **PostgreSQL `SELECT ... FOR UPDATE SKIP LOCKED`**, because:
- **Single Source of Truth:** Workflow topology, published version snapshots, execution runs, and leased steps are colocated in the same relational database. A worker can lease a step, read upstream inputs, and commit outputs inside an ACID boundary.
- **Zero Race Conditions:** PostgreSQL locks row locks at the storage engine level; competing workers instantly skip locked rows without blocking each other or causing deadlocks.
- **Crash Recovery & Reaping:** Each leased step records a `leased_until` timestamp. If a worker dies (`kill -9`, OOM), a lightweight background reaper scans `leased_until < NOW()` and reclaims the step for another worker without manual intervention.
- **Dead-Letter Queue (DLQ) & Replayability:** Permanently failed steps remain queryable and can be atomically reset to `queued` with attempt counter resets directly via REST API.

## Consequences
- Requires index on `(status, created_at)` and `(leased_until)`.
- Highly scalable up to 10,000+ operations/sec; for hyperscale (> 100k msgs/sec), sharding or partitioned queues can be introduced.
