# ADR 001: Yjs CRDTs over Operational Transformation (OT) for Graph Collaboration

## Context & Problem Statement
FlowMesh requires a real-time collaborative DAG canvas allowing multiple concurrent distributed developers to edit workflow topology, reposition nodes, alter configuration payloads, and work offline without suffering state corruption, race conditions, or sync conflicts.

## Decision Drivers
* Offline-first capability: Users must be able to continue designing pipelines on trains or during intermittent network outages.
* Conflict resolution without a central coordination lock: Node coordinate moves and edge modifications should commute deterministically.
* Memory & wire efficiency: Minimizing message size and CPU serialization overhead.

## Considered Options
1. **Operational Transformation (OT):** Centralized sequence transformation (Google Docs style).
2. **Automerge:** JSON-oriented CRDT library written in Rust/JS.
3. **Yjs:** Highly optimized State Vector-based CRDT framework.

## Decision Outcome
Chosen option: **Yjs**, because:
- **Local-first Persistence:** Yjs integrates natively with `y-indexeddb` to hydrate local browser state in $< 10\text{ms}$ upon app launch before network negotiation occurs.
- **P2P and Server Commutativity:** Updates commute in arbitrary orders without requiring an authoritative ordering sequencer.
- **Microsecond Struct Encoding:** Yjs uses a compact double-linked list with run-length encoding for binary updates, yielding $< 150\text{B}$ per node movement update compared to $> 4\text{KB}$ in JSON OT payloads.
- **Per-User Undo/Redo:** `Y.UndoManager` scopes undo actions exclusively to changes authored by the local user's origin, preventing an engineer from accidentally reverting a teammate's edits.

## Consequences
- Requires binary update transmission over WebSockets (`y-websocket` protocol).
- Room snapshots must periodically be compacted and written to PostgreSQL for persistent cold storage.
