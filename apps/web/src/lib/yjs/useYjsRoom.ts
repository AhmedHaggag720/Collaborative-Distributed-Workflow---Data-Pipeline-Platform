import { useEffect, useState, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { IndexeddbPersistence } from 'y-indexeddb';
import type { Node, Edge } from '@flowmesh/schema';

export interface Collaborator {
  id: string;
  name: string;
  color: string;
  cursor: { x: number; y: number } | null;
  selectedNodeId: string | null;
  lastActive: number;
}

const PEER_COLORS = [
  '#06B6D4', // cyan
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EC4899', // pink
  '#8B5CF6', // violet
  '#3B82F6', // blue
];

const LOCAL_USER = {
  id: `user_${Math.random().toString(36).substring(2, 7)}`,
  name: `Engineer ${Math.floor(Math.random() * 900) + 100}`,
  color: PEER_COLORS[Math.floor(Math.random() * PEER_COLORS.length)],
};

export function useYjsRoom(roomId = 'flowmesh-main-workspace') {
  const docRef = useRef<Y.Doc>(new Y.Doc());
  const yNodesRef = useRef<Y.Map<Node>>(docRef.current.getMap<Node>('nodes'));
  const yEdgesRef = useRef<Y.Map<Edge>>(docRef.current.getMap<Edge>('edges'));
  const undoManagerRef = useRef<Y.UndoManager | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [peers, setPeers] = useState<Map<string, Collaborator>>(new Map());
  const [isSynced, setIsSynced] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Initialize Y.Doc, IndexedDB local persistence, and UndoManager
  useEffect(() => {
    const doc = docRef.current;
    const yNodes = yNodesRef.current;
    const yEdges = yEdgesRef.current;

    // Local-first instant hydration via IndexedDB
    const idbProvider = new IndexeddbPersistence(roomId, doc);

    idbProvider.on('synced', () => {
      console.log(`[FlowMesh Local-First] IndexedDB synced for room: ${roomId}`);
      setNodes(Array.from(yNodes.values()));
      setEdges(Array.from(yEdges.values()));
      setIsSynced(true);
    });

    // Per-user UndoManager tracking only local user transactions
    const undoManager = new Y.UndoManager([yNodes, yEdges], {
      trackedOrigins: new Set(['local']),
    });
    undoManagerRef.current = undoManager;

    undoManager.on('stack-item-added', () => {
      setCanUndo(undoManager.canUndo());
      setCanRedo(undoManager.canRedo());
    });
    undoManager.on('stack-item-popped', () => {
      setCanUndo(undoManager.canUndo());
      setCanRedo(undoManager.canRedo());
    });

    // Observe changes to nodes map
    const handleNodesChange = () => {
      setNodes(Array.from(yNodes.values()));
    };
    yNodes.observe(handleNodesChange);

    // Observe changes to edges map
    const handleEdgesChange = () => {
      setEdges(Array.from(yEdges.values()));
    };
    yEdges.observe(handleEdgesChange);

    return () => {
      yNodes.unobserve(handleNodesChange);
      yEdges.unobserve(handleEdgesChange);
      idbProvider.destroy();
    };
  }, [roomId]);

  // WebSocket sync connection
  const connectWebSocket = useCallback(() => {
    if (!isOnline) return;

    try {
      const wsUrl = `ws://localhost:4001/sync/${roomId}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        console.log(`[FlowMesh CRDT] Connected to sync server (${roomId})`);
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'initial-snapshot' && data.updateBase64) {
            const binary = Uint8Array.from(atob(data.updateBase64), (c) => c.charCodeAt(0));
            Y.applyUpdate(docRef.current, binary, 'server-snapshot');
            setNodes(Array.from(yNodesRef.current.values()));
            setEdges(Array.from(yEdgesRef.current.values()));
          } else if (data.type === 'crdt-update' && data.updateBase64) {
            const binary = Uint8Array.from(atob(data.updateBase64), (c) => c.charCodeAt(0));
            Y.applyUpdate(docRef.current, binary, 'remote-peer');
            setNodes(Array.from(yNodesRef.current.values()));
            setEdges(Array.from(yEdgesRef.current.values()));
          } else if (data.type === 'awareness' && data.user) {
            setPeers((prev) => {
              const updated = new Map(prev);
              updated.set(data.user.id, {
                id: data.user.id,
                name: data.user.name,
                color: data.user.color,
                cursor: data.cursor,
                selectedNodeId: data.selectedNodeId,
                lastActive: Date.now(),
              });
              return updated;
            });
          }
        } catch (err) {
          console.warn('[Sync Client] Failed to parse message:', err);
        }
      };

      socket.onclose = () => {
        console.log('[FlowMesh CRDT] Disconnected from sync server');
      };
    } catch {
      // Offline fallback
    }
  }, [roomId, isOnline]);

  useEffect(() => {
    connectWebSocket();
    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, [connectWebSocket]);

  // Clean stale peer cursors after 8 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setPeers((prev) => {
        let changed = false;
        const updated = new Map(prev);
        for (const [id, peer] of updated.entries()) {
          if (now - peer.lastActive > 8000) {
            updated.delete(id);
            changed = true;
          }
        }
        return changed ? updated : prev;
      });
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Send incremental CRDT updates to server
  useEffect(() => {
    const doc = docRef.current;
    const handleDocUpdate = (update: Uint8Array, origin: any) => {
      // Don't echo remote or initial snapshots
      if (origin === 'remote-peer' || origin === 'server-snapshot' || origin === 'db-initial-load') {
        return;
      }

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && isOnline) {
        let binary = '';
        for (let i = 0; i < update.length; i++) {
          binary += String.fromCharCode(update[i]);
        }
        const updateBase64 = btoa(binary);
        socketRef.current.send(JSON.stringify({ type: 'crdt-update', updateBase64 }));
      }
    };

    doc.on('update', handleDocUpdate);
    return () => {
      doc.off('update', handleDocUpdate);
    };
  }, [isOnline]);

  // Broadcast awareness presence (cursor + selected node)
  const broadcastAwareness = useCallback(
    (cursor: { x: number; y: number } | null, selectedNodeId: string | null) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN && isOnline) {
        socketRef.current.send(
          JSON.stringify({
            type: 'awareness',
            user: LOCAL_USER,
            cursor,
            selectedNodeId,
          })
        );
      }
    },
    [isOnline]
  );

  // CRDT Mutations
  const setYNode = useCallback((node: Node) => {
    docRef.current.transact(() => {
      yNodesRef.current.set(node.id, node);
    }, 'local');
  }, []);

  const updateYNode = useCallback((nodeId: string, updates: Partial<Node>) => {
    docRef.current.transact(() => {
      const existing = yNodesRef.current.get(nodeId);
      if (existing) {
        yNodesRef.current.set(nodeId, { ...existing, ...updates });
      }
    }, 'local');
  }, []);

  const deleteYNode = useCallback((nodeId: string) => {
    docRef.current.transact(() => {
      yNodesRef.current.delete(nodeId);
      // Remove connected edges
      const edges = Array.from(yEdgesRef.current.values());
      for (const edge of edges) {
        if (edge.sourceNodeId === nodeId || edge.targetNodeId === nodeId) {
          yEdgesRef.current.delete(edge.id);
        }
      }
    }, 'local');
  }, []);

  const addYEdge = useCallback((edge: Edge) => {
    docRef.current.transact(() => {
      yEdgesRef.current.set(edge.id, edge);
    }, 'local');
  }, []);

  const deleteYEdge = useCallback((edgeId: string) => {
    docRef.current.transact(() => {
      yEdgesRef.current.delete(edgeId);
    }, 'local');
  }, []);

  const setBatchNodesAndEdges = useCallback((newNodes: Node[], newEdges: Edge[]) => {
    docRef.current.transact(() => {
      yNodesRef.current.clear();
      yEdgesRef.current.clear();
      for (const n of newNodes) yNodesRef.current.set(n.id, n);
      for (const e of newEdges) yEdgesRef.current.set(e.id, e);
    }, 'local');
  }, []);

  const undo = useCallback(() => {
    undoManagerRef.current?.undo();
  }, []);

  const redo = useCallback(() => {
    undoManagerRef.current?.redo();
  }, []);

  const toggleOnline = useCallback(() => {
    setIsOnline((prev) => {
      const next = !prev;
      if (!next && socketRef.current) {
        socketRef.current.close();
      }
      return next;
    });
  }, []);

  return {
    nodes,
    edges,
    peers: Array.from(peers.values()),
    currentUser: LOCAL_USER,
    isSynced,
    isOnline,
    canUndo,
    canRedo,
    setYNode,
    updateYNode,
    deleteYNode,
    addYEdge,
    deleteYEdge,
    setBatchNodesAndEdges,
    broadcastAwareness,
    undo,
    redo,
    toggleOnline,
  };
}
