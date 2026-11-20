import { willCreateCycle, topologicalSortBatches, validateDAG, Quadtree } from '../src/index.js';
import type { Node, Edge } from '@flowmesh/schema';
import assert from 'node:assert';

console.log('Running @flowmesh/dag-engine verification tests...');

// 1. Cycle Detection Test
const nodes: Node[] = [
  {
    id: 'n1',
    type: 'webhook_trigger',
    position: { x: 0, y: 0 },
    data: { type: 'webhook_trigger', label: 'T', config: { path: '/', method: 'POST', responseMode: 'immediate_ack', authRequired: false } },
    inputs: [],
    outputs: [{ id: 'out', name: 'out', type: 'json' }],
  },
  {
    id: 'n2',
    type: 'js_code_transform',
    position: { x: 300, y: 0 },
    data: { type: 'js_code_transform', label: 'C', config: { code: 'return input;', timeoutMs: 500, memoryLimitMb: 128 } },
    inputs: [{ id: 'in', name: 'in', type: 'json' }],
    outputs: [{ id: 'out', name: 'out', type: 'json' }],
  },
  {
    id: 'n3',
    type: 'http_request',
    position: { x: 600, y: 0 },
    data: { type: 'http_request', label: 'H', config: { url: 'https://httpbin.org', method: 'GET', timeoutMs: 5000, retryOn5xx: true, maxRetries: 3, headers: {} } },
    inputs: [{ id: 'in', name: 'in', type: 'json' }],
    outputs: [],
  },
];

const edges: Edge[] = [
  { id: 'e1', sourceNodeId: 'n1', sourcePortId: 'out', targetNodeId: 'n2', targetPortId: 'in', animated: true },
  { id: 'e2', sourceNodeId: 'n2', sourcePortId: 'out', targetNodeId: 'n3', targetPortId: 'in', animated: true },
];

// Valid DAG check
const val = validateDAG(nodes, edges);
assert.strictEqual(val.isValid, true, 'DAG should be valid');
assert.strictEqual(val.hasCycle, false, 'DAG should have no cycles');

// Candidate edge that creates a cycle: n3 -> n1
const cycleCandidate = willCreateCycle(nodes, edges, { sourceNodeId: 'n3', targetNodeId: 'n1' });
assert.strictEqual(cycleCandidate, true, 'n3 -> n1 must be flagged as a cycle');

// Candidate edge that does not create a cycle: n1 -> n3 (shortcut/bypass)
const nonCycleCandidate = willCreateCycle(nodes, edges, { sourceNodeId: 'n1', targetNodeId: 'n3' });
assert.strictEqual(nonCycleCandidate, false, 'n1 -> n3 must NOT be flagged as a cycle');

// Self-loop test: n2 -> n2
const selfLoop = willCreateCycle(nodes, edges, { sourceNodeId: 'n2', targetNodeId: 'n2' });
assert.strictEqual(selfLoop, true, 'Self-referencing loop must be detected');

// 2. Topological Sort Batches Test
const { batches, hasCycle } = topologicalSortBatches(nodes, edges);
assert.strictEqual(hasCycle, false);
assert.strictEqual(batches.length, 3);
assert.deepStrictEqual(batches[0], ['n1']);
assert.deepStrictEqual(batches[1], ['n2']);
assert.deepStrictEqual(batches[2], ['n3']);

// 3. Quadtree Spatial Index Test
const qt = new Quadtree({ x: 0, y: 0, width: 2000, height: 2000 });
qt.insert({ id: 'item1', bounds: { x: 50, y: 50, width: 100, height: 100 }, data: 'item1' });
qt.insert({ id: 'item2', bounds: { x: 1500, y: 1500, width: 100, height: 100 }, data: 'item2' });

const viewport1 = { x: 0, y: 0, width: 500, height: 500 };
const result1 = qt.query(viewport1);
assert.strictEqual(result1.length, 1);
assert.strictEqual(result1[0].id, 'item1');

const viewportFar = { x: 1000, y: 1000, width: 1000, height: 1000 };
const resultFar = qt.query(viewportFar);
assert.strictEqual(resultFar.length, 1);
assert.strictEqual(resultFar[0].id, 'item2');

console.log('All @flowmesh/dag-engine verification tests PASSED cleanly!');
