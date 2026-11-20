import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import * as Y from 'yjs';

dotenv.config();

const port = Number(process.env.PORT_SYNC || 4001);
const host = '0.0.0.0';

// In-memory document map for room sessions
const docs = new Map<string, Y.Doc>();

export async function buildSyncServer() {
  const server = Fastify({
    logger: {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    },
  });

  await server.register(cors, { origin: '*' });
  await server.register(websocket);

  server.get('/health', async () => ({
    status: 'ok',
    service: 'flowmesh-sync-server',
    activeRooms: docs.size,
    timestamp: new Date().toISOString(),
  }));

  // WebSocket sync endpoint
  server.register(async function (fastify) {
    fastify.get('/sync/:room', { websocket: true }, (socket, req) => {
      const { room } = req.params as { room: string };
      server.log.info(`Client connected to room: ${room}`);

      if (!docs.has(room)) {
        docs.set(room, new Y.Doc());
      }
      const doc = docs.get(room)!;

      // Send initial state vector / sync step 1
      socket.send(JSON.stringify({
        type: 'sync-ready',
        room,
        clientsCount: 1,
      }));

      socket.on('message', (message: Buffer) => {
        try {
          const text = message.toString();
          // Heartbeat or JSON message
          if (text === 'ping') {
            socket.send('pong');
            return;
          }
        } catch {
          // Binary Yjs update handling in Phase 2
        }
      });

      socket.on('close', () => {
        server.log.info(`Client disconnected from room: ${room}`);
      });
    });
  });

  return server;
}

if (process.argv[1]?.endsWith('server.ts') || process.argv[1]?.endsWith('server.js')) {
  buildSyncServer()
    .then((app) => {
      app.listen({ port, host }, (err, address) => {
        if (err) {
          app.log.error(err);
          process.exit(1);
        }
        app.log.info(`FlowMesh Yjs Sync Server running at ${address}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start sync server:', err);
      process.exit(1);
    });
}
