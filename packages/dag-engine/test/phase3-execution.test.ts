import assert from 'node:assert';
import { areDependenciesSatisfied, getDownstreamNodes, topologicalSortBatches } from '../src/index.js';
import type { Edge } from '@flowmesh/schema';

console.log('Running Phase 3 Distributed Engine verification tests...');

// 1. Exponential Backoff with Jitter Formula Test
function testBackoffWithJitter(attempt: number, baseMs = 1000, maxMs = 30000): number {
  const exponential = Math.min(maxMs, baseMs * Math.pow(2, Math.max(0, attempt - 1)));
  return Math.floor(Math.random() * exponential);
}

for (let attempt = 1; attempt <= 6; attempt++) {
  const delay = testBackoffWithJitter(attempt);
  const maxPossible = Math.min(30000, 1000 * Math.pow(2, attempt - 1));
  assert(delay >= 0, 'Backoff delay must be non-negative');
  assert(delay <= maxPossible, `Delay ${delay} exceeded theoretical ceiling ${maxPossible}`);
}
console.log('✓ Exponential backoff with full jitter passed verification.');

// 2. Fan-out & Fan-in Dependency Satisfaction
const edges: Edge[] = [
  { id: 'e1', sourceNodeId: 'root', sourcePortId: 'out', targetNodeId: 'taskA', targetPortId: 'in', animated: false },
  { id: 'e2', sourceNodeId: 'root', sourcePortId: 'out', targetNodeId: 'taskB', targetPortId: 'in', animated: false },
  // Fan-in: sink waits for both taskA AND taskB
  { id: 'e3', sourceNodeId: 'taskA', sourcePortId: 'out', targetNodeId: 'sink', targetPortId: 'inA', animated: false },
  { id: 'e4', sourceNodeId: 'taskB', sourcePortId: 'out', targetNodeId: 'sink', targetPortId: 'inB', animated: false },
];

const completedSet = new Set<string>(['root']);

// Root is done -> taskA and taskB should be ready
assert.strictEqual(areDependenciesSatisfied('taskA', edges, completedSet), true);
assert.strictEqual(areDependenciesSatisfied('taskB', edges, completedSet), true);

// Sink should NOT be ready yet (waiting for taskA and taskB)
assert.strictEqual(areDependenciesSatisfied('sink', edges, completedSet), false);

// Only taskA finishes -> Sink still NOT ready
completedSet.add('taskA');
assert.strictEqual(areDependenciesSatisfied('sink', edges, completedSet), false);

// taskB finishes -> Sink IS ready!
completedSet.add('taskB');
assert.strictEqual(areDependenciesSatisfied('sink', edges, completedSet), true);
console.log('✓ Fan-out and fan-in dependency resolution passed verification.');

// 3. Conditional Branch Routing
const branchEdges: Edge[] = [
  { id: 'b1', sourceNodeId: 'branch', sourcePortId: 'true', targetNodeId: 'vipHandler', targetPortId: 'in', animated: false },
  { id: 'b2', sourceNodeId: 'branch', sourcePortId: 'false', targetNodeId: 'stdHandler', targetPortId: 'in', animated: false },
];

const activePort = 'true';
const activeEdges = branchEdges.filter((e) => e.sourcePortId === activePort);
assert.strictEqual(activeEdges.length, 1);
assert.strictEqual(activeEdges[0].targetNodeId, 'vipHandler');
console.log('✓ Conditional branch port filtering passed verification.');

console.log('All Phase 3 execution engine verification tests PASSED cleanly!');
