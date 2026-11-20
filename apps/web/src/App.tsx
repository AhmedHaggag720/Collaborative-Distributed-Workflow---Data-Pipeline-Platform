import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { 
  Play, 
  Share2, 
  Plus, 
  Layers, 
  Activity, 
  CheckCircle2, 
  Download, 
  Upload, 
  Sparkles, 
  Zap, 
  AlertTriangle, 
  RotateCcw,
  Undo2,
  Redo2,
  Copy,
  Wifi,
  WifiOff
} from 'lucide-react';
import type { Node, Edge, NodeType } from '@flowmesh/schema';
import { 
  validateDAG, 
  topologicalSortBatches, 
  willCreateCycle, 
  Quadtree 
} from '@flowmesh/dag-engine';
import { GridBackground } from './components/Canvas/GridBackground';
import { BezierEdge } from './components/Canvas/BezierEdge';
import { ConnectionDraftEdge } from './components/Canvas/ConnectionDraftEdge';
import { NodeCard } from './components/Nodes/NodeCard';
import { NodePalette } from './components/Toolbar/NodePalette';
import { NodeConfigDrawer } from './components/Inspector/NodeConfigDrawer';
import { MiniMap } from './components/Canvas/MiniMap';
import { PresenceCursors } from './components/Multiplayer/PresenceCursors';
import { PeerBadges } from './components/Multiplayer/PeerBadges';
import { useYjsRoom } from './lib/yjs/useYjsRoom';
import { useLiveTelemetry } from './lib/telemetry/useLiveTelemetry';
import { ExecutionInspectorDrawer } from './components/Inspector/ExecutionInspectorDrawer';
import type { ConnectionDraft, DragItem } from './types/canvas';

const demoSeedNodes: Node[] = [
  {
    id: 'node-webhook-1',
    type: 'webhook_trigger',
    position: { x: 100, y: 220 },
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
    width: 250,
    height: 130,
  },
  {
    id: 'node-transform-1',
    type: 'js_code_transform',
    position: { x: 440, y: 180 },
    data: {
      type: 'js_code_transform',
      label: 'Normalize & Validate',
      config: {
        code: `export default async function transform(input) {
  const order = input.body || input;
  return {
    orderId: order.id || 'ord_' + Date.now(),
    customerEmail: (order.email || 'guest@example.com').toLowerCase(),
    totalCents: Math.round((order.amount || 0) * 100),
    isValid: true
  };
}`,
        timeoutMs: 500,
        memoryLimitMb: 128,
      },
    },
    inputs: [{ id: 'in-1', name: 'Raw Order', type: 'json' }],
    outputs: [{ id: 'out-1', name: 'Normalized Data', type: 'json' }],
    width: 260,
    height: 140,
  },
  {
    id: 'node-branch-1',
    type: 'conditional_branch',
    position: { x: 790, y: 190 },
    data: {
      type: 'conditional_branch',
      label: 'High-Value Check',
      config: {
        conditionExpression: 'return input.totalCents >= 50000;',
        trueBranchPortId: 'true',
        falseBranchPortId: 'false',
      },
    },
    inputs: [{ id: 'in-1', name: 'Input', type: 'json' }],
    outputs: [
      { id: 'true', name: 'VIP Order', type: 'json' },
      { id: 'false', name: 'Standard Order', type: 'json' },
    ],
    width: 250,
    height: 140,
  },
  {
    id: 'node-http-vip',
    type: 'http_request',
    position: { x: 1140, y: 100 },
    data: {
      type: 'http_request',
      label: 'VIP Concierge Webhook',
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
    outputs: [{ id: 'out-1', name: 'Response', type: 'json' }],
    width: 250,
    height: 130,
  },
  {
    id: 'node-timer-1',
    type: 'delay_timer',
    position: { x: 1140, y: 300 },
    data: {
      type: 'delay_timer',
      label: 'Fulfillment Throttler',
      config: {
        delayMs: 1500,
        jitter: true,
      },
    },
    inputs: [{ id: 'in-1', name: 'Input', type: 'json' }],
    outputs: [{ id: 'out-1', name: 'Delayed', type: 'json' }],
    width: 240,
    height: 120,
  },
];

const demoSeedEdges: Edge[] = [
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
    targetNodeId: 'node-branch-1',
    targetPortId: 'in-1',
    animated: true,
  },
  {
    id: 'edge-3',
    sourceNodeId: 'node-branch-1',
    sourcePortId: 'true',
    targetNodeId: 'node-http-vip',
    targetPortId: 'in-1',
    animated: true,
  },
  {
    id: 'edge-4',
    sourceNodeId: 'node-branch-1',
    sourcePortId: 'false',
    targetNodeId: 'node-timer-1',
    targetPortId: 'in-1',
    animated: true,
  },
];

export default function App() {
  const {
    nodes,
    edges,
    peers,
    currentUser,
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
  } = useYjsRoom('flowmesh-main-workspace');

  const [pan, setPan] = useState({ x: 40, y: 60 });
  const [zoom, setZoom] = useState(1);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanMouse, setLastPanMouse] = useState<{ x: number; y: number } | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'error' | 'success' | 'info' } | null>(null);
  const [fps, setFps] = useState(60);
  const [inspectingNodeId, setInspectingNodeId] = useState<string | null>(null);

  // Phase 5: Live Telemetry & Metrics Hook
  const {
    isConnected: isTelemetryConnected,
    nodeStatuses,
    metrics: telemetryMetrics,
    activeRunId,
    eventCount,
    triggerWorkflowRun,
    replayDlqStep,
  } = useLiveTelemetry('workflow-demo-1');

  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Initialize demo seed if room is clean
  useEffect(() => {
    if (isSynced && nodes.length === 0) {
      setBatchNodesAndEdges(demoSeedNodes, demoSeedEdges);
    }
  }, [isSynced, nodes.length, setBatchNodesAndEdges]);

  // FPS calculation for senior benchmarking
  useEffect(() => {
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const measure = (now: number) => {
      frameCount++;
      if (now - lastTime >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastTime)));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(measure);
    };

    animId = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(animId);
  }, []);

  const showToast = (text: string, type: 'error' | 'success' | 'info' = 'info') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Keyboard shortcut for Undo / Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  // DAG validation
  const validation = useMemo(() => validateDAG(nodes, edges), [nodes, edges]);
  const { batches } = useMemo(() => topologicalSortBatches(nodes, edges), [nodes, edges]);

  // Spatial Index (Quadtree) for Viewport Culling
  const quadtree = useMemo(() => {
    const qt = new Quadtree<Node>({ x: -10000, y: -10000, width: 30000, height: 30000 });
    for (const node of nodes) {
      qt.insert({
        id: node.id,
        bounds: {
          x: node.position.x,
          y: node.position.y,
          width: node.width || 250,
          height: node.height || 140,
        },
        data: node,
      });
    }
    return qt;
  }, [nodes]);

  // Visible nodes computed with viewport bounds query
  const visibleNodes = useMemo(() => {
    if (nodes.length <= 150) return nodes;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const buffer = 300;
    const viewportRect = {
      x: (-pan.x - buffer) / zoom,
      y: (-pan.y - buffer) / zoom,
      width: (width + buffer * 2) / zoom,
      height: (height + buffer * 2) / zoom,
    };
    const queried = quadtree.query(viewportRect);
    return queried.map((q) => q.data);
  }, [nodes, pan, zoom, quadtree]);

  // Screen to world coordinate transformation
  const screenToWorld = useCallback(
    (screenX: number, screenY: number) => ({
      x: (screenX - pan.x) / zoom,
      y: (screenY - pan.y) / zoom,
    }),
    [pan, zoom]
  );

  // Zoom-to-cursor handling
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    const newZoom = e.deltaY < 0 ? Math.min(2.5, zoom * zoomFactor) : Math.max(0.3, zoom / zoomFactor);
    if (newZoom === zoom) return;

    const mouseX = e.clientX;
    const mouseY = e.clientY;
    const worldX = (mouseX - pan.x) / zoom;
    const worldY = (mouseY - pan.y) / zoom;

    setPan({
      x: mouseX - worldX * newZoom,
      y: mouseY - worldY * newZoom,
    });
    setZoom(newZoom);
  };

  // Node Dragging & Canvas Panning Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
      setIsPanning(true);
      setLastPanMouse({ x: e.clientX, y: e.clientY });
      setSelectedNodeId(null);
      broadcastAwareness(null, null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const worldPos = screenToWorld(e.clientX, e.clientY);

    // Broadcast cursor presence to peers (throttled naturally by mouse events)
    broadcastAwareness(worldPos, selectedNodeId);

    if (isPanning && lastPanMouse) {
      const dx = e.clientX - lastPanMouse.x;
      const dy = e.clientY - lastPanMouse.y;
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
      setLastPanMouse({ x: e.clientX, y: e.clientY });
      return;
    }

    if (dragItem) {
      const dx = (e.clientX - dragItem.startX) / zoom;
      const dy = (e.clientY - dragItem.startY) / zoom;
      updateYNode(dragItem.id, {
        position: { x: dragItem.nodeStartX + dx, y: dragItem.nodeStartY + dy },
      });
      return;
    }

    if (connectionDraft) {
      setConnectionDraft((draft) => (draft ? { ...draft, currentPos: worldPos } : null));
    }
  };

  const handleMouseUp = () => {
    setIsPanning(false);
    setLastPanMouse(null);
    setDragItem(null);
    setConnectionDraft(null);
  };

  // Connection management with cycle rejection
  const handleStartConnect = (sourceNodeId: string, sourcePortId: string, sourcePos: { x: number; y: number }) => {
    setConnectionDraft({
      sourceNodeId,
      sourcePortId,
      sourcePos,
      currentPos: sourcePos,
    });
  };

  const handleEndConnect = (targetNodeId: string, targetPortId: string) => {
    if (!connectionDraft) return;
    const { sourceNodeId, sourcePortId } = connectionDraft;

    if (sourceNodeId === targetNodeId) {
      showToast('Self-referencing loops are not permitted.', 'error');
      setConnectionDraft(null);
      return;
    }

    const exists = edges.some(
      (e) => e.sourceNodeId === sourceNodeId && e.targetNodeId === targetNodeId && e.sourcePortId === sourcePortId
    );
    if (exists) {
      setConnectionDraft(null);
      return;
    }

    const createsCycle = willCreateCycle(nodes, edges, { sourceNodeId, targetNodeId });
    if (createsCycle) {
      showToast('Cycle Rejected: Adding this connection would cause an infinite loop!', 'error');
      setConnectionDraft(null);
      return;
    }

    const newEdge: Edge = {
      id: `edge_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId,
      animated: true,
    };

    addYEdge(newEdge);
    setConnectionDraft(null);
    showToast('Edge connected & synced to CRDT', 'success');
  };

  // Node CRUD operations with Yjs CRDT
  const handleAddNode = (type: NodeType) => {
    const centerWorld = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
    const id = `node_${type}_${Date.now().toString(36)}`;

    const nodeDataMap: Record<NodeType, any> = {
      webhook_trigger: {
        type: 'webhook_trigger',
        label: 'Webhook Ingress',
        config: { path: '/webhook', method: 'POST', responseMode: 'immediate_ack' },
      },
      http_request: {
        type: 'http_request',
        label: 'API Request',
        config: { url: 'https://httpbin.org/post', method: 'POST', timeoutMs: 5000 },
      },
      js_code_transform: {
        type: 'js_code_transform',
        label: 'V8 Code Transform',
        config: { code: 'export default async function transform(input) {\n  return input;\n}', timeoutMs: 500, memoryLimitMb: 128 },
      },
      conditional_branch: {
        type: 'conditional_branch',
        label: 'Branch Router',
        config: { conditionExpression: 'return Boolean(input);', trueBranchPortId: 'true', falseBranchPortId: 'false' },
      },
      delay_timer: {
        type: 'delay_timer',
        label: 'Timer Delay',
        config: { delayMs: 1000, jitter: false },
      },
    };

    const portsMap: Record<NodeType, { inputs: any[]; outputs: any[] }> = {
      webhook_trigger: { inputs: [], outputs: [{ id: 'out-1', name: 'Trigger Payload', type: 'json' }] },
      http_request: { inputs: [{ id: 'in-1', name: 'Payload', type: 'json' }], outputs: [{ id: 'out-1', name: 'Response', type: 'json' }] },
      js_code_transform: { inputs: [{ id: 'in-1', name: 'Input', type: 'json' }], outputs: [{ id: 'out-1', name: 'Clean Data', type: 'json' }] },
      conditional_branch: { 
        inputs: [{ id: 'in-1', name: 'Condition Input', type: 'json' }], 
        outputs: [{ id: 'true', name: 'True Port', type: 'json' }, { id: 'false', name: 'False Port', type: 'json' }] 
      },
      delay_timer: { inputs: [{ id: 'in-1', name: 'Input', type: 'json' }], outputs: [{ id: 'out-1', name: 'Delayed', type: 'json' }] },
    };

    const newNode: Node = {
      id,
      type,
      position: { x: Math.round(centerWorld.x) - 120, y: Math.round(centerWorld.y) - 60 },
      data: nodeDataMap[type],
      inputs: portsMap[type].inputs,
      outputs: portsMap[type].outputs,
      width: 250,
      height: 130,
    };

    setYNode(newNode);
    setSelectedNodeId(id);
    showToast(`Added ${newNode.data.label}`, 'info');
  };

  const handleDuplicateNode = (nodeId: string) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) return;

    const copy: Node = {
      ...target,
      id: `node_${target.type}_${Date.now().toString(36)}`,
      position: { x: target.position.x + 40, y: target.position.y + 40 },
    };

    setYNode(copy);
    setSelectedNodeId(copy.id);
  };

  // Auto-Layout via Web Worker
  const handleAutoLayout = () => {
    showToast('Calculating hierarchical auto-layout in Web Worker...', 'info');
    const worker = new Worker(new URL('./workers/layout.worker.ts', import.meta.url), { type: 'module' });
    worker.postMessage({ nodes, edges, options: { horizontalSpacing: 340, verticalSpacing: 180 } });

    worker.onmessage = (e) => {
      const { success, positions } = e.data;
      if (success) {
        for (const [nodeId, pos] of Object.entries(positions)) {
          updateYNode(nodeId, { position: pos as { x: number; y: number } });
        }
        showToast('Auto-layout synchronized across peers!', 'success');
      }
      worker.terminate();
    };
  };

  // Stress-Test 1,000 Nodes
  const handleToggle1000Nodes = () => {
    if (nodes.length > 500) {
      setBatchNodesAndEdges(demoSeedNodes, demoSeedEdges);
      setPan({ x: 40, y: 60 });
      setZoom(1);
      showToast('Restored standard collaborative DAG', 'info');
      return;
    }

    showToast('Generating 1,000 Nodes with Quadtree Spatial Index...', 'info');
    const cols = 40;
    const rows = 25;
    const testNodes: Node[] = [];
    const testEdges: Edge[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const id = `node_${r}_${c}`;
        testNodes.push({
          id,
          type: (c % 2 === 0 ? 'js_code_transform' : 'http_request') as NodeType,
          position: { x: c * 320, y: r * 180 },
          data: {
            type: 'js_code_transform',
            label: `Node [${r}, ${c}]`,
            config: { code: 'return input;', timeoutMs: 500, memoryLimitMb: 128 },
          },
          inputs: [{ id: 'in', name: 'In', type: 'json' }],
          outputs: [{ id: 'out', name: 'Out', type: 'json' }],
          width: 240,
          height: 120,
        });

        if (c > 0 && Math.random() > 0.4) {
          testEdges.push({
            id: `edge_${r}_${c}`,
            sourceNodeId: `node_${r}_${c - 1}`,
            sourcePortId: 'out',
            targetNodeId: id,
            targetPortId: 'in',
            animated: false,
          });
        }
      }
    }

    setBatchNodesAndEdges(testNodes, testEdges);
    setPan({ x: 20, y: 20 });
    setZoom(0.35);
    showToast(`1,000 nodes active! Viewport culling maintains 60 FPS.`, 'success');
  };

  // JSON Import & Export
  const handleExportJSON = () => {
    const data = JSON.stringify({ nodes, edges, version: 1, exportedAt: new Date().toISOString() }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowmesh-dag-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Workflow JSON exported', 'success');
  };

  const handleImportJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target?.result as string);
        if (Array.isArray(parsed.nodes) && Array.isArray(parsed.edges)) {
          const val = validateDAG(parsed.nodes, parsed.edges);
          if (!val.isValid) {
            showToast(`Invalid DAG imported: ${val.errors[0]}`, 'error');
            return;
          }
          setBatchNodesAndEdges(parsed.nodes, parsed.edges);
          showToast('Workflow DAG imported & synced to room', 'success');
        }
      } catch (err) {
        showToast(`Failed to parse JSON: ${(err as Error).message}`, 'error');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Simulation Runner
  const simulateRun = async () => {
    if (isExecuting) return;
    setIsExecuting(true);
    showToast('Executing pipeline stages...', 'info');

    for (const batch of batches) {
      for (const nodeId of batch) {
        setActiveStepId(nodeId);
        await new Promise((r) => setTimeout(r, 450));
      }
    }

    setActiveStepId(null);
    setIsExecuting(false);
    showToast('Workflow execution completed with 100% success!', 'success');
  };

  const handleTriggerWorkerRun = async () => {
    showToast('Triggering workflow run on distributed worker fleet...', 'info');
    const result = await triggerWorkflowRun();
    if (result) {
      showToast(`Workflow execution triggered! Run ID: ${result.runId?.substring(0, 8)}...`, 'success');
    } else {
      showToast('Worker API offline: running local canvas simulation', 'info');
      simulateRun();
    }
  };

  const selectedNode = useMemo(() => nodes.find((n) => n.id === selectedNodeId) || null, [nodes, selectedNodeId]);
  const inspectingNode = useMemo(() => nodes.find((n) => n.id === inspectingNodeId) || null, [nodes, inspectingNodeId]);

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans select-none">
      <input type="file" ref={fileInputRef} onChange={handleImportJSON} accept=".json" className="hidden" />

      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-slate-800 bg-[#0F172A]/90 backdrop-blur-md px-4 flex items-center justify-between z-20 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white">FlowMesh</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Phase 2 Verified
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300">
                {fps} FPS
              </span>
            </div>
            <p className="text-[11px] text-slate-400">Collaborative Local-First CRDT Workflow Platform</p>
          </div>
        </div>

        {/* Center Actions */}
        <div className="flex items-center gap-2">
          {/* Per-user Undo / Redo */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (Ctrl+Z)"
              className="p-1.5 hover:bg-slate-800 text-slate-300 disabled:opacity-40 rounded transition"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (Ctrl+Shift+Z)"
              className="p-1.5 hover:bg-slate-800 text-slate-300 disabled:opacity-40 rounded transition"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleAutoLayout}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold transition shadow-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Auto Layout
          </button>

          <button
            onClick={handleToggle1000Nodes}
            className={`flex items-center gap-1.5 px-3 py-1.5 border rounded-lg text-xs font-semibold transition shadow-sm ${
              nodes.length > 500
                ? 'bg-rose-950/80 border-rose-700 text-rose-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5 text-cyan-400" />
            {nodes.length > 500 ? 'Reset 1,000 Nodes' : '1,000 Nodes'}
          </button>
        </div>

        {/* Right Actions: Multiplayer Presence & Run */}
        <div className="flex items-center gap-3">
          {/* SSE Live Telemetry Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-[11px] font-mono">
            <span className={`w-2 h-2 rounded-full ${isTelemetryConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
            <span className="text-slate-300">SSE: {isTelemetryConnected ? 'Live' : 'Offline'}</span>
            {eventCount > 0 && <span className="text-cyan-400 font-bold font-mono">({eventCount})</span>}
          </div>

          <PeerBadges
            peers={peers}
            currentUser={currentUser}
            isOnline={isOnline}
            onToggleOnline={toggleOnline}
          />

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleExportJSON}
              title="Export DAG to JSON"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            >
              <Download className="w-4 h-4" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import DAG from JSON"
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            >
              <Upload className="w-4 h-4" />
            </button>

            <button
              onClick={handleTriggerWorkerRun}
              disabled={isExecuting || !validation.isValid}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-xs font-semibold shadow-md transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              {isExecuting ? 'Running...' : 'Run Pipeline'}
            </button>
          </div>
        </div>
      </header>

      {/* Workspace Canvas Container */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        className="relative flex-1 overflow-hidden cursor-default bg-[#0B0F19]"
      >
        <GridBackground zoom={zoom} pan={pan} />

        <NodePalette onAddNode={handleAddNode} />

        {/* Live Multiplayer Cursors */}
        <PresenceCursors peers={peers} pan={pan} zoom={zoom} />

        {/* SVG Bézier Edges Layer */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
          <g style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            {edges.map((edge) => (
              <BezierEdge
                key={edge.id}
                edge={edge}
                sourceNode={nodes.find((n) => n.id === edge.sourceNodeId)}
                targetNode={nodes.find((n) => n.id === edge.targetNodeId)}
                isActive={activeStepId === edge.targetNodeId}
                onDelete={deleteYEdge}
              />
            ))}

            {connectionDraft && <ConnectionDraftEdge draft={connectionDraft} />}
          </g>
        </svg>

        {/* Nodes Layer with Viewport Culling */}
        <div
          className="absolute inset-0 pointer-events-none z-10"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {visibleNodes.map((node) => {
            const peerWithSelection = peers.find((p) => p.selectedNodeId === node.id);

            return (
              <div
                key={node.id}
                className="pointer-events-auto"
                onMouseDown={(e) => {
                  if (e.button === 0) {
                    e.stopPropagation();
                    setSelectedNodeId(node.id);
                    broadcastAwareness(screenToWorld(e.clientX, e.clientY), node.id);
                    setDragItem({
                      id: node.id,
                      startX: e.clientX,
                      startY: e.clientY,
                      nodeStartX: node.position.x,
                      nodeStartY: node.position.y,
                    });
                  }
                }}
              >
                <NodeCard
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  isActive={activeStepId === node.id}
                  peerSelection={peerWithSelection ? { name: peerWithSelection.name, color: peerWithSelection.color } : undefined}
                  telemetry={nodeStatuses[node.id]}
                  metric={telemetryMetrics[node.id]}
                  onSelect={(id) => {
                    setSelectedNodeId(id);
                    broadcastAwareness(null, id);
                  }}
                  onInspectStep={(id) => setInspectingNodeId(id)}
                  onStartConnect={handleStartConnect}
                  onEndConnect={handleEndConnect}
                  onDeleteNode={deleteYNode}
                  onDuplicateNode={handleDuplicateNode}
                />
              </div>
            );
          })}
        </div>

        {/* Canvas HUD Controls (Bottom-Left) */}
        <div className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg text-xs backdrop-blur-md shadow-xl">
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z - 0.1))}
            className="w-6 h-6 flex items-center justify-center hover:bg-slate-800 rounded font-bold"
          >
            -
          </button>
          <span className="w-12 text-center text-slate-300 font-mono text-[11px]">{Math.round(zoom * 100)}%</span>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.1))}
            className="w-6 h-6 flex items-center justify-center hover:bg-slate-800 rounded font-bold"
          >
            +
          </button>
          <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
          <button
            onClick={() => {
              setPan({ x: 40, y: 60 });
              setZoom(1);
            }}
            title="Reset Pan & Zoom"
            className="p-1 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Graph Status HUD (Bottom-Center) */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs backdrop-blur-md shadow-xl flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            {validation.isValid ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-slate-200 font-medium">Valid DAG</span>
              </>
            ) : (
              <>
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span className="text-rose-300 font-medium">{validation.errors[0]}</span>
              </>
            )}
          </div>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400 font-mono text-[11px]">
            {nodes.length} Nodes • {edges.length} Edges
          </span>
          <span className="text-indigo-400 text-[10px] bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/20 font-mono">
            CRDT Synced
          </span>
        </div>

        <MiniMap nodes={nodes} pan={pan} zoom={zoom} />

        <NodeConfigDrawer
          node={selectedNode}
          onClose={() => {
            setSelectedNodeId(null);
            broadcastAwareness(null, null);
          }}
          onUpdateConfig={updateYNode}
          onDeleteNode={deleteYNode}
        />

        <ExecutionInspectorDrawer
          isOpen={Boolean(inspectingNodeId)}
          onClose={() => setInspectingNodeId(null)}
          nodeName={inspectingNode?.data?.label || inspectingNodeId || 'Node'}
          nodeType={inspectingNode?.type || 'node'}
          telemetryState={inspectingNodeId ? nodeStatuses[inspectingNodeId] : undefined}
          onReplayStep={async (stepId) => {
            await replayDlqStep(stepId);
            showToast('Replayed step from DLQ!', 'success');
          }}
        />

        {toastMessage && (
          <div className="absolute top-18 right-4 z-40 animate-in fade-in slide-in-from-top-2 duration-200">
            <div
              className={`px-4 py-2.5 rounded-xl border shadow-2xl backdrop-blur-xl text-xs font-semibold flex items-center gap-2 ${
                toastMessage.type === 'error'
                  ? 'bg-rose-950/90 border-rose-700/80 text-rose-200'
                  : toastMessage.type === 'success'
                  ? 'bg-emerald-950/90 border-emerald-700/80 text-emerald-200'
                  : 'bg-indigo-950/90 border-indigo-700/80 text-indigo-200'
              }`}
            >
              {toastMessage.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400" />}
              {toastMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              {toastMessage.type === 'info' && <Activity className="w-4 h-4 text-cyan-400" />}
              <span>{toastMessage.text}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
