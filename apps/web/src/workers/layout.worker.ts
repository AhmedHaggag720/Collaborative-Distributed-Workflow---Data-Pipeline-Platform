// Web Worker for offloading graph layout computation from the main UI thread

self.onmessage = (e: MessageEvent) => {
  const { nodes, edges, options } = e.data;
  const horizontalSpacing = options?.horizontalSpacing || 320;
  const verticalSpacing = options?.verticalSpacing || 180;
  const startX = options?.startX || 100;
  const startY = options?.startY || 100;

  // Build in-degree and forward adjacency
  const forward: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};

  for (const node of nodes) {
    forward[node.id] = [];
    inDegree[node.id] = 0;
  }

  for (const edge of edges) {
    if (!forward[edge.sourceNodeId]) forward[edge.sourceNodeId] = [];
    forward[edge.sourceNodeId].push(edge.targetNodeId);
    inDegree[edge.targetNodeId] = (inDegree[edge.targetNodeId] || 0) + 1;
  }

  const batches: string[][] = [];
  let currentBatch: string[] = [];

  for (const nodeId of Object.keys(inDegree)) {
    if (inDegree[nodeId] === 0) {
      currentBatch.push(nodeId);
    }
  }

  while (currentBatch.length > 0) {
    batches.push(currentBatch);
    const nextBatch: string[] = [];

    for (const nodeId of currentBatch) {
      const neighbors = forward[nodeId] || [];
      for (const neighbor of neighbors) {
        inDegree[neighbor] = inDegree[neighbor] - 1;
        if (inDegree[neighbor] === 0) {
          nextBatch.push(neighbor);
        }
      }
    }
    currentBatch = nextBatch;
  }

  // Calculate new positions
  const positions: Record<string, { x: number; y: number }> = {};
  batches.forEach((batch, layerIndex) => {
    const layerX = startX + layerIndex * horizontalSpacing;
    const totalHeight = (batch.length - 1) * verticalSpacing;
    const layerStartY = startY + Math.max(0, (500 - totalHeight) / 2);

    batch.forEach((nodeId, nodeIndex) => {
      positions[nodeId] = {
        x: layerX,
        y: layerStartY + nodeIndex * verticalSpacing,
      };
    });
  });

  self.postMessage({ success: true, positions });
};
