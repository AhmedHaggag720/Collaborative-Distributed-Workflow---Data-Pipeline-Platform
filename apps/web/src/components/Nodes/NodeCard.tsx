import React from 'react';
import type { Node } from '@flowmesh/schema';
import { 
  Globe, 
  Radio, 
  Code2, 
  GitBranch, 
  Clock, 
  Trash2,
  Copy,
  Zap,
  CheckCircle2,
  AlertCircle,
  Activity
} from 'lucide-react';

interface NodeCardProps {
  node: Node;
  isSelected: boolean;
  isActive: boolean;
  peerSelection?: { name: string; color: string };
  telemetry?: {
    status: 'running' | 'completed' | 'failed' | 'retrying' | 'dlq';
    durationMs?: number;
  };
  metric?: {
    p95?: number;
  };
  onSelect: (nodeId: string) => void;
  onInspectStep?: (nodeId: string) => void;
  onStartConnect: (nodeId: string, portId: string, clientPos: { x: number; y: number }) => void;
  onEndConnect: (nodeId: string, portId: string) => void;
  onDeleteNode: (nodeId: string) => void;
  onDuplicateNode: (nodeId: string) => void;
}

export const NodeCard: React.FC<NodeCardProps> = ({
  node,
  isSelected,
  isActive,
  peerSelection,
  telemetry,
  metric,
  onSelect,
  onInspectStep,
  onStartConnect,
  onEndConnect,
  onDeleteNode,
  onDuplicateNode,
}) => {
  const typeConfig = {
    webhook_trigger: {
      color: 'border-cyan-500/50 bg-cyan-950/20 text-cyan-400',
      badge: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20',
      icon: <Globe className="w-4 h-4 text-cyan-400" />,
      label: 'Webhook Trigger',
    },
    http_request: {
      color: 'border-indigo-500/50 bg-indigo-950/20 text-indigo-400',
      badge: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
      icon: <Radio className="w-4 h-4 text-indigo-400" />,
      label: 'HTTP Request',
    },
    js_code_transform: {
      color: 'border-emerald-500/50 bg-emerald-950/20 text-emerald-400',
      badge: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
      icon: <Code2 className="w-4 h-4 text-emerald-400" />,
      label: 'JS Code Transform',
    },
    conditional_branch: {
      color: 'border-amber-500/50 bg-amber-950/20 text-amber-400',
      badge: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
      icon: <GitBranch className="w-4 h-4 text-amber-400" />,
      label: 'Conditional Branch',
    },
    delay_timer: {
      color: 'border-rose-500/50 bg-rose-950/20 text-rose-400',
      badge: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
      icon: <Clock className="w-4 h-4 text-rose-400" />,
      label: 'Delay Timer',
    },
  }[node.type] || {
    color: 'border-slate-500/50 bg-slate-950/20 text-slate-400',
    badge: 'bg-slate-500/10 text-slate-300 border-slate-500/20',
    icon: <Zap className="w-4 h-4 text-slate-400" />,
    label: node.type,
  };

  const config = node.data?.config as any;

  // Visual status indicators for telemetry
  const isRunning = telemetry?.status === 'running';
  const isCompleted = telemetry?.status === 'completed';
  const isFailed = telemetry?.status === 'failed' || telemetry?.status === 'dlq';

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node.id);
        if (onInspectStep && telemetry) {
          onInspectStep(node.id);
        }
      }}
      className={`absolute rounded-xl bg-[#0F172A]/95 border shadow-xl backdrop-blur-md transition-all duration-150 select-none cursor-move ${
        isRunning
          ? 'border-cyan-400 ring-4 ring-cyan-500/40 shadow-cyan-500/50 animate-pulse'
          : isCompleted
          ? 'border-emerald-500/80 ring-2 ring-emerald-500/30'
          : isFailed
          ? 'border-rose-500/90 ring-4 ring-rose-500/30 shadow-rose-500/30'
          : isActive
          ? 'border-emerald-400 ring-4 ring-emerald-500/20 shadow-emerald-500/40'
          : peerSelection
          ? 'ring-2 shadow-lg'
          : isSelected
          ? 'border-indigo-400 ring-2 ring-indigo-500/30 shadow-indigo-500/30'
          : 'border-slate-800 hover:border-slate-700 hover:shadow-2xl'
      }`}
      style={{
        transform: `translate(${node.position.x}px, ${node.position.y}px)`,
        width: `${node.width || 240}px`,
        borderColor: peerSelection ? peerSelection.color : undefined,
      }}
    >
      {/* Peer selection tag */}
      {peerSelection && (
        <div
          style={{ backgroundColor: peerSelection.color }}
          className="absolute -top-5 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold text-slate-950 uppercase shadow-md"
        >
          {peerSelection.name} editing
        </div>
      )}

      {/* Latency & Telemetry Overlays */}
      <div className="absolute -top-4 right-2 flex items-center gap-1.5 pointer-events-none">
        {metric?.p95 !== undefined && metric.p95 > 0 && (
          <span className="bg-slate-900 border border-slate-700 text-amber-400 text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-0.5">
            ⚡ {metric.p95}ms p95
          </span>
        )}
        {isRunning && (
          <span className="bg-cyan-950 border border-cyan-500/50 text-cyan-300 text-[9px] font-mono px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
            RUNNING
          </span>
        )}
        {isCompleted && (
          <span className="bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-[9px] font-mono px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-1">
            <CheckCircle2 className="w-2.5 h-2.5 text-emerald-400" />
            {telemetry.durationMs !== undefined ? `${telemetry.durationMs}ms` : 'DONE'}
          </span>
        )}
        {isFailed && (
          <span className="bg-rose-950 border border-rose-500/50 text-rose-300 text-[9px] font-mono px-1.5 py-0.5 rounded-full shadow-md flex items-center gap-1">
            <AlertCircle className="w-2.5 h-2.5 text-rose-400" />
            {telemetry?.status === 'dlq' ? 'DLQ' : 'ERR'}
          </span>
        )}
      </div>

      {/* Node Header */}
      <div className="p-3 pb-2 flex items-center justify-between border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg border ${typeConfig.badge}`}>
            {typeConfig.icon}
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-100 truncate max-w-[140px]">
              {node.data?.label || typeConfig.label}
            </div>
            <div className="text-[10px] text-slate-400 capitalize">{node.type.replace('_', ' ')}</div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          {isActive && (
            <span className="flex h-2 w-2 relative mr-1">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDuplicateNode(node.id);
            }}
            title="Duplicate Node"
            className="p-1 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200"
          >
            <Copy className="w-3 h-3" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDeleteNode(node.id);
            }}
            title="Delete Node"
            className="p-1 hover:bg-rose-950/50 rounded text-slate-400 hover:text-rose-400"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Node Body Details */}
      <div className="p-3 py-2 text-[11px] text-slate-400 font-mono space-y-1">
        {node.data.type === 'webhook_trigger' && (
          <div className="flex items-center justify-between">
            <span className="text-cyan-400 font-bold">{config?.method || 'POST'}</span>
            <span className="text-slate-300 truncate max-w-[130px]">{config?.path || '/'}</span>
          </div>
        )}
        {node.data.type === 'http_request' && (
          <div>
            <div className="text-indigo-400 font-bold">{config?.method || 'GET'}</div>
            <div className="text-slate-300 truncate max-w-[200px]">{config?.url || 'https://...'}</div>
          </div>
        )}
        {node.data.type === 'js_code_transform' && (
          <div className="text-emerald-400/90 text-[10px] bg-slate-950/60 p-1.5 rounded border border-slate-800/80 font-mono truncate">
            {config?.code ? config.code.split('\n')[0] : 'transform(input)'}
          </div>
        )}
        {node.data.type === 'conditional_branch' && (
          <div className="text-amber-400/90 text-[10px] bg-slate-950/60 p-1.5 rounded border border-slate-800/80 font-mono truncate">
            {config?.conditionExpression || 'return Boolean(input);'}
          </div>
        )}
        {node.data.type === 'delay_timer' && (
          <div className="flex items-center justify-between text-rose-400">
            <span>Delay:</span>
            <span className="text-slate-200">{config?.delayMs || 1000} ms</span>
          </div>
        )}
      </div>

      {/* Input Ports (Left Side) */}
      {node.inputs?.length > 0 && (
        <div className="absolute -left-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          {node.inputs.map((port) => (
            <div
              key={port.id}
              title={`Input Port: ${port.name}`}
              onMouseUp={(e) => {
                e.stopPropagation();
                onEndConnect(node.id, port.id);
              }}
              className="w-5 h-5 rounded-full bg-slate-800 border-2 border-indigo-400 flex items-center justify-center hover:scale-125 transition-transform cursor-crosshair shadow-md"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>
          ))}
        </div>
      )}

      {/* Output Ports (Right Side) */}
      {node.outputs?.length > 0 && (
        <div className="absolute -right-2.5 top-1/2 -translate-y-1/2 flex flex-col gap-2">
          {node.outputs.map((port) => (
            <div
              key={port.id}
              title={`Output Port: ${port.name}`}
              onMouseDown={(e) => {
                e.stopPropagation();
                const rect = (e.target as HTMLElement).getBoundingClientRect();
                onStartConnect(node.id, port.id, {
                  x: node.position.x + (node.width || 240),
                  y: node.position.y + 60,
                });
              }}
              className="w-5 h-5 rounded-full bg-slate-800 border-2 border-emerald-400 flex items-center justify-center hover:scale-125 transition-transform cursor-crosshair shadow-md"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
