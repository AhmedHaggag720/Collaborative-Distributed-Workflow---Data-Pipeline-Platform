import { db } from './client.js';
import { workflows } from './schema.js';

export async function seedDemoWorkflow() {
  console.log('Seeding demo FlowMesh pipeline...');

  const sampleNodes = [
    {
      id: 'node-webhook-1',
      type: 'webhook_trigger',
      position: { x: 100, y: 200 },
      data: {
        type: 'webhook_trigger',
        label: 'Order Ingestion Webhook',
        config: {
          path: '/orders',
          method: 'POST',
          responseMode: 'immediate_ack',
          authRequired: false,
        },
      },
      inputs: [],
      outputs: [{ id: 'out-1', name: 'Trigger Payload', type: 'json' }],
      width: 240,
      height: 140,
    },
    {
      id: 'node-transform-1',
      type: 'js_code_transform',
      position: { x: 440, y: 150 },
      data: {
        type: 'js_code_transform',
        label: 'Normalize Order Schema',
        config: {
          code: `export default async function transform(input) {
  const order = input.body || input;
  return {
    orderId: order.id || 'ord_' + Date.now(),
    customerEmail: (order.email || 'guest@example.com').toLowerCase(),
    totalCents: Math.round((order.amount || 0) * 100),
    processedAt: new Date().toISOString()
  };
}`,
          timeoutMs: 500,
          memoryLimitMb: 128,
        },
      },
      inputs: [{ id: 'in-1', name: 'Raw Order', type: 'json' }],
      outputs: [{ id: 'out-1', name: 'Normalized Order', type: 'json' }],
      width: 260,
      height: 150,
    },
    {
      id: 'node-http-1',
      type: 'http_request',
      position: { x: 800, y: 180 },
      data: {
        type: 'http_request',
        label: 'Dispatch to Inventory API',
        config: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          timeoutMs: 5000,
          retryOn5xx: true,
          maxRetries: 3,
        },
      },
      inputs: [{ id: 'in-1', name: 'Payload', type: 'json' }],
      outputs: [{ id: 'out-1', name: 'API Response', type: 'json' }],
      width: 250,
      height: 140,
    },
  ];

  const sampleEdges = [
    {
      id: 'edge-1',
      sourceNodeId: 'node-webhook-1',
      sourcePortId: 'out-1',
      targetNodeId: 'node-transform-1',
      targetPortId: 'in-1',
      animated: true,
    },
    {
      id: 'edge-2',
      sourceNodeId: 'node-transform-1',
      sourcePortId: 'out-1',
      targetNodeId: 'node-http-1',
      targetPortId: 'in-1',
      animated: true,
    },
  ];

  const [inserted] = await db
    .insert(workflows)
    .values({
      name: 'E-Commerce Order Processing Pipeline',
      description: 'Webhook triggered DAG that normalizes order data and synchronizes to external APIs.',
      version: 1,
      nodes: sampleNodes,
      edges: sampleEdges,
      viewport: { x: 0, y: 0, zoom: 1 },
      isPublished: true,
    })
    .returning();

  console.log(`Seeded workflow created with ID: ${inserted.id}`);
  return inserted;
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDemoWorkflow()
    .then(() => {
      console.log('Seed completed.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
