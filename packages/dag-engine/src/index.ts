import type { Node, Edge } from '@flowmesh/schema';

export interface GraphValidationResult {
  isValid: boolean;
  hasCycle: boolean;
  errors: string[];
  cyclePath?: string[];
}

export interface AdjacencyList {
  forward: Map<string, Set<string>>;
  reverse: Map<string, Set<string>>;
}

/**
 * Builds forward and reverse adjacency representations from nodes and edges.
 */
export function buildAdjacencyList(nodes: Node[], edges: Edge[]): AdjacencyList {
  const forward = new Map<string, Set<string>>();
  const reverse = new Map<string, Set<string>>();

  for (const node of nodes) {
    forward.set(node.id, new Set<string>());
    reverse.set(node.id, new Set<string>());
  }

  for (const edge of edges) {
    if (!forward.has(edge.sourceNodeId)) {
      forward.set(edge.sourceNodeId, new Set<string>());
    }
    if (!reverse.has(edge.targetNodeId)) {
      reverse.set(edge.targetNodeId, new Set<string>());
    }
    forward.get(edge.sourceNodeId)!.add(edge.targetNodeId);
    reverse.get(edge.targetNodeId)!.add(edge.sourceNodeId);
  }

  return { forward, reverse };
}

/**
 * Checks if adding candidate edge (source -> target) creates a cycle in the DAG.
 */
export function willCreateCycle(
  nodes: Node[],
  edges: Edge[],
  candidateEdge: { sourceNodeId: string; targetNodeId: string }
): boolean {
  if (candidateEdge.sourceNodeId === candidateEdge.targetNodeId) {
    return true;
  }

  const { forward } = buildAdjacencyList(nodes, edges);

  // DFS from candidate target to see if it can reach candidate source
  const visited = new Set<string>();
  const stack = [candidateEdge.targetNodeId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current === candidateEdge.sourceNodeId) {
      return true;
    }
    if (!visited.has(current)) {
      visited.add(current);
      const neighbors = forward.get(current);
      if (neighbors) {
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            stack.push(neighbor);
          }
        }
      }
    }
  }

  return false;
}

/**
 * Performs topological sorting using Kahn's algorithm.
 * Returns batches of node IDs that can run concurrently.
 */
export function topologicalSortBatches(nodes: Node[], edges: Edge[]): { batches: string[][]; hasCycle: boolean } {
  const { forward, reverse } = buildAdjacencyList(nodes, edges);
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    inDegree.set(node.id, reverse.get(node.id)?.size ?? 0);
  }

  const batches: string[][] = [];
  let currentBatch: string[] = [];

  for (const [nodeId, degree] of inDegree.entries()) {
    if (degree === 0) {
      currentBatch.push(nodeId);
    }
  }

  let visitedCount = 0;

  while (currentBatch.length > 0) {
    batches.push(currentBatch);
    visitedCount += currentBatch.length;
    const nextBatch: string[] = [];

    for (const nodeId of currentBatch) {
      const neighbors = forward.get(nodeId) ?? new Set<string>();
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          nextBatch.push(neighbor);
        }
      }
    }

    currentBatch = nextBatch;
  }

  const hasCycle = visitedCount < nodes.length;
  return { batches, hasCycle };
}

/**
 * Validates a DAG for structural integrity, cycles, and dangling references.
 */
export function validateDAG(nodes: Node[], edges: Edge[]): GraphValidationResult {
  const errors: string[] = [];
  const nodeMap = new Map<string, Node>(nodes.map((n) => [n.id, n]));

  for (const edge of edges) {
    if (!nodeMap.has(edge.sourceNodeId)) {
      errors.push(`Edge '${edge.id}' references missing source node '${edge.sourceNodeId}'`);
    }
    if (!nodeMap.has(edge.targetNodeId)) {
      errors.push(`Edge '${edge.id}' references missing target node '${edge.targetNodeId}'`);
    }
  }

  const { hasCycle } = topologicalSortBatches(nodes, edges);
  if (hasCycle) {
    errors.push('Graph contains one or more cyclical dependencies (loops).');
  }

  return {
    isValid: errors.length === 0,
    hasCycle,
    errors,
  };
}

/**
 * Finds all root nodes (nodes with 0 incoming edges).
 */
export function findRootNodes(nodes: Node[], edges: Edge[]): Node[] {
  const { reverse } = buildAdjacencyList(nodes, edges);
  return nodes.filter((n) => (reverse.get(n.id)?.size ?? 0) === 0);
}

/**
 * Finds downstream dependent nodes for a completed node.
 */
export function getDownstreamNodes(nodeId: string, edges: Edge[]): string[] {
  return edges.filter((e) => e.sourceNodeId === nodeId).map((e) => e.targetNodeId);
}

/**
 * Checks if all upstream dependencies for a target node have completed.
 */
export function areDependenciesSatisfied(
  targetNodeId: string,
  edges: Edge[],
  completedNodeIds: Set<string>
): boolean {
  const upstream = edges.filter((e) => e.targetNodeId === targetNodeId).map((e) => e.sourceNodeId);
  return upstream.every((upId) => completedNodeIds.has(upId));
}
