import type { Node, Edge } from '@flowmesh/schema';
import { topologicalSortBatches } from './index.js';

export interface LayoutOptions {
  horizontalSpacing?: number;
  verticalSpacing?: number;
  startX?: number;
  startY?: number;
}

/**
 * Calculates a clean hierarchical DAG layout (layered topological ordering).
 * Safe to execute inside a Web Worker.
 */
export function computeHierarchicalLayout(
  nodes: Node[],
  edges: Edge[],
  options: LayoutOptions = {}
): Map<string, { x: number; y: number }> {
  const {
    horizontalSpacing = 320,
    verticalSpacing = 180,
    startX = 100,
    startY = 100,
  } = options;

  const positions = new Map<string, { x: number; y: number }>();
  const { batches } = topologicalSortBatches(nodes, edges);

  batches.forEach((batch, layerIndex) => {
    const layerX = startX + layerIndex * horizontalSpacing;
    const totalHeight = (batch.length - 1) * verticalSpacing;
    const layerStartY = startY + Math.max(0, (500 - totalHeight) / 2);

    batch.forEach((nodeId, nodeIndex) => {
      positions.set(nodeId, {
        x: layerX,
        y: layerStartY + nodeIndex * verticalSpacing,
      });
    });
  });

  return positions;
}
