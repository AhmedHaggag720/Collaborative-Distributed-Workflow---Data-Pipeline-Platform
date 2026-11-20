import React, { useState } from 'react';
import { 
  Play, 
  Share2, 
  Plus, 
  Layers, 
  Activity, 
  CheckCircle2, 
  Database,
  Cpu,
  Globe,
  Radio,
  Clock,
  GitBranch,
  Code2
} from 'lucide-react';
import type { Node, Edge } from '@flowmesh/schema';
import { validateDAG, topologicalSortBatches } from '@flowmesh/dag-engine';

const initialNodes: Node[] = [
  {
    id: 'node-1',
    type: 'webhook_trigger',
    position: { x: 120, y: 220 },
    data: {
      type: 'webhook_trigger',
      label: 'Order Webhook',
      config: {
        path: '/orders',
        method: 'POST',
        responseMode: 'immediate_ack',
        authRequired: false,
      },
    },
    inputs: [],
    outputs: [{ id: 'out-1', name: 'Payload', type: 'json' }],
    width: 240,
    height: 120,
  },
  {
    id: 'node-2',
    type: 'js_code_transform',
    position: { x: 440, y: 180 },
    data: {
      type: 'js_code_transform',
      label: 'Normalize & Validate',
      config: {
        code: 'export default async function(input) {\n  return { orderId: input.id, valid: true };\n}',
        timeoutMs: 500,
        memoryLimitMb: 128,
      },
    },
    inputs: [{ id: 'in-1', name: 'Input', type: 'json' }],
    outputs: [{ id: 'out-1', name: 'Clean Data', type: 'json' }],
    width: 250,
    height: 130,
  },
  {
    id: 'node-3',
    type: 'http_request',
    position: { x: 780, y: 200 },
    data: {
      type: 'http_request',
      label: 'Sync to ERP API',
      config: {
        url: 'https://api.erp.internal/sync',
        method: 'POST',
        headers: {},
        timeoutMs: 5000,
        retryOn5xx: true,
        maxRetries: 3,
      },
    },
    inputs: [{ id: 'in-1', name: 'Data', type: 'json' }],
    outputs: [{ id: 'out-1', name: 'ERP Response', type: 'json' }],
    width: 240,
    height: 120,
  },
];

const initialEdges: Edge[] = [
  {
    id: 'edge-1',
    sourceNodeId: 'node-1',
    sourcePortId: 'out-1',
    targetNodeId: 'node-2',
    targetPortId: 'in-1',
    animated: true,
  },
  {
    id: 'edge-2',
    sourceNodeId: 'node-2',
    sourcePortId: 'out-1',
    targetNodeId: 'node-3',
    targetPortId: 'in-1',
    animated: true,
  },
];

export default function App() {
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges] = useState<Edge[]>(initialEdges);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [isExecuting, setIsExecuting] = useState(false);
  const [activeStepId, setActiveStepId] = useState<string | null>(null);

  const validation = validateDAG(nodes, edges);
  const { batches } = topologicalSortBatches(nodes, edges);

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'webhook_trigger':
        return <Globe className="w-4 h-4 text-cyan-400" />;
      case 'js_code_transform':
        return <Code2 className="w-4 h-4 text-emerald-400" />;
      case 'http_request':
        return <Radio className="w-4 h-4 text-indigo-400" />;
      case 'conditional_branch':
        return <GitBranch className="w-4 h-4 text-amber-400" />;
      case 'delay_timer':
        return <Clock className="w-4 h-4 text-rose-400" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  const simulateRun = async () => {
    if (isExecuting) return;
    setIsExecuting(true);

    for (const batch of batches) {
      for (const nodeId of batch) {
        setActiveStepId(nodeId);
        await new Promise((r) => setTimeout(r, 600));
      }
    }

    setActiveStepId(null);
    setIsExecuting(false);
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0F19] text-slate-100 overflow-hidden font-sans">
      {/* Top Navigation */}
      <header className="h-14 border-b border-slate-800 bg-[#0F172A]/80 backdrop-blur-md px-4 flex items-center justify-between z-20">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-500 to-cyan-400 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Activity className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold tracking-tight text-white">FlowMesh</span>
              <span className="text-[10px] uppercase font-semibold px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                Phase 0 Verified
              </span>
            </div>
            <p className="text-xs text-slate-400">Collaborative Distributed Workflow & Data Pipeline Platform</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Live System Status Badges */}
          <div className="hidden md:flex items-center gap-2 text-xs bg-slate-900/90 border border-slate-800 rounded-lg px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Postgres
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-cyan-400">Redis</span>
            <span className="text-slate-600">•</span>
            <span className="text-indigo-400">TimescaleDB</span>
          </div>

          <button
            onClick={simulateRun}
            disabled={isExecuting}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg text-xs font-semibold shadow-md transition disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {isExecuting ? 'Executing...' : 'Trigger Pipeline'}
          </button>

          <button className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-md transition">
            <Share2 className="w-3.5 h-3.5" />
            Collaborate
          </button>
        </div>
      </header>

      {/* Main Workspace Canvas */}
      <div className="relative flex-1 canvas-grid overflow-hidden">
        {/* SVG Bezier Edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
          {edges.map((edge) => {
            const source = nodes.find((n) => n.id === edge.sourceNodeId);
            const target = nodes.find((n) => n.id === edge.targetNodeId);
            if (!source || !target) return null;

            const startX = source.position.x + 240;
            const startY = source.position.y + 60;
            const endX = target.position.x;
            const endY = target.position.y + 60;
            const deltaX = Math.abs(endX - startX) * 0.5;

            const path = `M ${startX} ${startY} C ${startX + deltaX} ${startY}, ${endX - deltaX} ${endY}, ${endX} ${endY}`;

            return (
              <g key={edge.id}>
                <path
                  d={path}
                  stroke="#334155"
                  strokeWidth="3"
                  fill="none"
                />
                <path
                  d={path}
                  stroke={activeStepId === target.id ? '#10B981' : '#6366F1'}
                  strokeWidth="2"
                  strokeDasharray={edge.animated ? '6,6' : 'none'}
                  className={edge.animated ? 'animate-[dash_1s_linear_infinite]' : ''}
                  fill="none"
                />
              </g>
            );
          })}
        </svg>

        {/* Nodes layer */}
        <div 
          className="absolute inset-0 transition-transform duration-75"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}
        >
          {nodes.map((node) => {
            const isActive = activeStepId === node.id;
            return (
              <div
                key={node.id}
                style={{
                  transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                  width: `${node.width || 240}px`,
                }}
                className={`absolute rounded-xl bg-slate-900/95 border transition-all duration-200 shadow-xl backdrop-blur-md p-4 cursor-grab ${
                  isActive
                    ? 'border-emerald-400 ring-4 ring-emerald-500/20 shadow-emerald-500/30'
                    : 'border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-800/80">
                  <div className="flex items-center gap-2">
                    {getNodeIcon(node.type)}
                    <span className="text-xs font-semibold text-slate-200">{node.data?.label || node.type}</span>
                  </div>
                  {isActive && (
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 font-mono truncate">
                  {node.data.type === 'http_request' && (node.data.config as any)?.url}
                  {node.data.type === 'webhook_trigger' && `Path: ${(node.data.config as any)?.path}`}
                  {node.data.type === 'js_code_transform' && 'TypeScript Sandboxed (V8)'}
                </div>

                {/* Ports */}
                <div className="mt-3 flex justify-between items-center text-[10px] text-slate-500">
                  <span>{node.inputs?.length ? '● in' : ''}</span>
                  <span>{node.outputs?.length ? 'out ●' : ''}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Canvas HUD Controls */}
        <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 bg-slate-900/90 border border-slate-800 p-1.5 rounded-lg text-xs backdrop-blur-md shadow-lg">
          <button 
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))}
            className="px-2 py-1 hover:bg-slate-800 rounded font-bold"
          >
            -
          </button>
          <span className="text-slate-400 font-mono">{Math.round(zoom * 100)}%</span>
          <button 
            onClick={() => setZoom((z) => Math.min(2, z + 0.1))}
            className="px-2 py-1 hover:bg-slate-800 rounded font-bold"
          >
            +
          </button>
          <div className="w-[1px] h-4 bg-slate-700 mx-1"></div>
          <button 
            onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }}
            className="px-2 py-1 hover:bg-slate-800 text-slate-400 rounded"
          >
            Reset
          </button>
        </div>

        {/* DAG Validation Badge */}
        <div className="absolute bottom-4 right-4 z-10 bg-slate-900/90 border border-slate-800 px-3 py-2 rounded-lg text-xs backdrop-blur-md shadow-lg flex items-center gap-2">
          {validation.isValid ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span className="text-slate-300">DAG Valid • {batches.length} Execution Stage(s)</span>
            </>
          ) : (
            <span className="text-rose-400">{validation.errors[0]}</span>
          )}
        </div>
      </div>
    </div>
  );
}
