import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import * as dotenv from 'dotenv';
import * as Y from 'yjs';
import { Redis } from 'ioredis';
import { db, workflows, eq } from '@flowmesh/db';
import type { Node, Edge } from '@flowmesh/schema';

dotenv.config();

const port = Number(process.env.PORT_SYNC || 4001);
const host = '0.0.0.0';
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Redis pub/sub clients for horizontal multi-instance scaling
let redisPub: Redis | null = null;
let redisSub: Redis | null = null;

try {
  redisPub = new Redis(redisUrl, { retryStrategy: () => 3000, maxRetriesPerRequest: 1 });
  redisSub = new Redis(redisUrl, { retryStrategy: () => 3000, maxRetriesPerRequest: 1 });

  redisPub.on('error', (err: any) => console.warn('[Sync Server] Redis Pub client warning:', err.message));
  redisSub.on('error', (err: any) => console.warn('[Sync Server] Redis Sub client warning:', err.message));
} catch (e: any) {
  console.warn('[Sync Server] Running with in-memory sync (Redis unavailable)');
}

interface RoomSession {
  doc: Y.Doc;
  clients: Set<any>;
  saveTimeout: NodeJS.Timeout | null;
}

const rooms = new Map<string, RoomSession>();

// Subscribe to cross-instance Redis updates
if (redisSub) {
  redisSub.subscribe('flowmesh:crdt:updates', (err: any) => {
    if (!err) {
      console.log('[Sync Server] Subscribed to horizontal Redis channel: flowmesh:crdt:updates');
    }
  });

  redisSub.on('message', (channel: string, message: string) => {
    if (channel === 'flowmesh:crdt:updates') {
      try {
        const { room, updateBase64, originId } = JSON.parse(message);
        const session = rooms.get(room);
        if (session && originId !== process.pid) {
          const update = Buffer.from(updateBase64, 'base64');
          Y.applyUpdate(session.doc, update, 'redis-remote');

          // Broadcast to connected local clients
          const payload = JSON.stringify({ type: 'crdt-update', updateBase64 });
          for (const client of session.clients) {
            if (client.readyState === 1) {
              client.send(payload);
            }
          }
        }
      } catch (err) {
        console.error('[Sync Server] Failed to process Redis CRDT message:', err);
      }
    }
  });
}

function getOrCreateRoom(roomId: string): RoomSession {
  let session = rooms.get(roomId);
  if (!session) {
    const doc = new Y.Doc();
    session = {
      doc,
      clients: new Set(),
      saveTimeout: null,
    };

    // Load initial workflow snapshot from PostgreSQL if exists
    loadSnapshotFromDb(roomId, doc).catch((err) => {
      console.warn(`[Sync Server] Could not load DB snapshot for room ${roomId}:`, err.message);
    });

    // Listen for local doc updates to broadcast and persist
    doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin === 'redis-remote') return;

      const updateBase64 = Buffer.from(update).toString('base64');

      // Publish to Redis for other server instances
      if (redisPub) {
        redisPub.publish(
          'flowmesh:crdt:updates',
          JSON.stringify({ room: roomId, updateBase64, originId: process.pid })
        ).catch(() => {});
      }

      // Broadcast to local clients in this room
      const payload = JSON.stringify({ type: 'crdt-update', updateBase64 });
      for (const client of session!.clients) {
        if (client.readyState === 1 && client !== origin) {
          client.send(payload);
        }
      }

      // Debounce saving snapshot to PostgreSQL
      if (session!.saveTimeout) clearTimeout(session!.saveTimeout);
      session!.saveTimeout = setTimeout(() => {
        persistSnapshotToDb(roomId, session!.doc).catch((err) => {
          console.warn(`[Sync Server] Snapshot persist error for room ${roomId}:`, err.message);
        });
      }, 3000);
    });

    rooms.set(roomId, session);
  }
  return session;
}

async function loadSnapshotFromDb(roomId: string, doc: Y.Doc) {
  try {
    const [wf] = await db.select().from(workflows).where(eq(workflows.id, roomId));
    if (wf) {
      const yNodes = doc.getMap<Node>('nodes');
      const yEdges = doc.getMap<Edge>('edges');

      doc.transact(() => {
        const nodesList = (wf.nodes as Node[]) || [];
        const edgesList = (wf.edges as Edge[]) || [];

        for (const node of nodesList) {
          if (!yNodes.has(node.id)) yNodes.set(node.id, node);
        }
        for (const edge of edgesList) {
          if (!yEdges.has(edge.id)) yEdges.set(edge.id, edge);
        }
      }, 'db-initial-load');
      console.log(`[Sync Server] Loaded workflow snapshot from DB for room ${roomId}`);
    }
  } catch {
    // Ignore if not a valid UUID workflow yet
  }
}

async function persistSnapshotToDb(roomId: string, doc: Y.Doc) {
  try {
    const yNodes = doc.getMap<Node>('nodes');
    const yEdges = doc.getMap<Edge>('edges');

    const nodes = Array.from(yNodes.values());
    const edges = Array.from(yEdges.values());

    await db
      .update(workflows)
      .set({
        nodes,
        edges,
        updatedAt: new Date(),
      })
      .where(eq(workflows.id, roomId));

    console.log(`[Sync Server] Compacted binary snapshot persisted to PostgreSQL for ${roomId}`);
  } catch {
    // Non-UUID rooms or demo rooms don't break persistence
  }
}

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
    activeRooms: rooms.size,
    timestamp: new Date().toISOString(),
    redisConnected: redisPub ? redisPub.status === 'ready' : false,
  }));

  // WebSocket sync room
  server.register(async function (fastify) {
    fastify.get('/sync/:room', { websocket: true }, (socket, req) => {
      const { room } = req.params as { room: string };
      const session = getOrCreateRoom(room);
      session.clients.add(socket);

      server.log.info(`Collaborator connected to room: ${room} (Total peers: ${session.clients.size})`);

      // Send initial full state snapshot
      const fullSnapshot = Y.encodeStateAsUpdate(session.doc);
      socket.send(
        JSON.stringify({
          type: 'initial-snapshot',
          room,
          updateBase64: Buffer.from(fullSnapshot).toString('base64'),
          peerCount: session.clients.size,
        })
      );

      socket.on('message', (data: Buffer | string) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString();
          const parsed = JSON.parse(raw);

          if (parsed.type === 'crdt-update' && parsed.updateBase64) {
            const update = Buffer.from(parsed.updateBase64, 'base64');
            Y.applyUpdate(session.doc, update, socket);
          } else if (parsed.type === 'awareness') {
            // Relay cursor and selection presence to all other peers in the room
            const awarenessPayload = JSON.stringify({
              type: 'awareness',
              user: parsed.user,
              cursor: parsed.cursor,
              selectedNodeId: parsed.selectedNodeId,
            });

            for (const client of session.clients) {
              if (client !== socket && client.readyState === 1) {
                client.send(awarenessPayload);
              }
            }
          }
        } catch (err) {
          server.log.warn(`Invalid sync message: ${(err as Error).message}`);
        }
      });

      socket.on('close', () => {
        session.clients.delete(socket);
        server.log.info(`Collaborator disconnected from room: ${room} (Remaining peers: ${session.clients.size})`);
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
        app.log.info(`FlowMesh CRDT Sync Server (Yjs + Redis) listening on ${address}`);
      });
    })
    .catch((err) => {
      console.error('Failed to start sync server:', err);
      process.exit(1);
    });
}
