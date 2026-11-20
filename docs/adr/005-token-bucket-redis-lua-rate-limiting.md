# ADR 005: Redis Lua Token Bucket Rate Limiting & Circuit Breakers for Ingress and Egress Protection

## Context & Problem Statement
A multi-tenant workflow platform must protect both ingress endpoints (`POST /hooks/:workflowId`) from rogue traffic spikes and downstream third-party APIs from cascading failures during outbound HTTP dispatching.

## Decision Drivers
* Atomic cluster-wide rate limiting without race conditions across multiple API replicas.
* Prevention of cascading worker pool exhaustion when third-party HTTP endpoints experience outages.
* Fail-fast behavior for degraded remote services.

## Considered Options
1. **In-Memory Rate Limiting:** Local bucket per process instance (leaks quotas across multi-replica clusters).
2. **Fixed Window Counter in Redis:** Susceptible to burst doubling at window boundaries.
3. **Atomic Redis Lua Token Bucket + Egress Circuit Breaker:**
   - Token bucket calculated in a single Redis atomic script.
   - Three-state Circuit Breaker (`CLOSED`, `OPEN`, `HALF_OPEN`) wrapped around outbound HTTP dispatches.

## Decision Outcome
Chosen option: **Redis Lua Token Bucket + Host Circuit Breaker**, because:
- **Atomic Cluster-Wide Quota:** By executing the token refill and consumption math inside an atomic Lua script (`EVAL`), multiple API instances share a single authoritative quota per tenant without distributed locking overhead.
- **Smooth Traffic Shaping:** Token bucket permits configurable bursts (e.g., 100 requests) while enforcing steady-state refill limits (e.g., 20 requests/sec).
- **Circuit Breaker Fail-Fast:** If a downstream service fails repeatedly ($> 5$ consecutive timeouts or 5xx), the breaker trips to `OPEN`. Workers fail fast without waiting for 8-second timeouts, keeping thread pools and worker leases free for healthy pipelines.
- **Graceful Self-Healing:** After `resetTimeoutMs` (15s), the breaker shifts to `HALF_OPEN` to probe upstream availability before resuming full traffic flow.

## Consequences
- Requires Redis connection for cluster-wide enforcement (with in-memory fallback for local development).
