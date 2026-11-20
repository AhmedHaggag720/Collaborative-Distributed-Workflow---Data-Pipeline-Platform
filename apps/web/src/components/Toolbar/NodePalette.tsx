import React from 'react';
import type { NodeType } from '@flowmesh/schema';
import { 
  Globe, 
  Radio, 
  Code2, 
  GitBranch, 
  Clock, 
  Plus
} from 'lucide-react';

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
}

export const NodePalette: React.FC<NodePaletteProps> = ({ onAddNode }) => {
  const paletteItems: { type: NodeType; label: string; icon: React.ReactNode; desc: string; color: string }[] = [
    {
      type: 'webhook_trigger',
      label: 'Webhook Trigger',
      desc: 'Ingests external HTTP requests into pipeline',
      icon: <Globe className="w-4 h-4 text-cyan-400" />,
      color: 'hover:border-cyan-500/50 hover:bg-cyan-950/20',
    },
    {
      type: 'http_request',
      label: 'HTTP Request',
      desc: 'Dispatches outbound API requests',
      icon: <Radio className="w-4 h-4 text-indigo-400" />,
      color: 'hover:border-indigo-500/50 hover:bg-indigo-950/20',
    },
    {
      type: 'js_code_transform',
      label: 'JS Code Transform',
      desc: 'Runs sandboxed V8 JS/TS script',
      icon: <Code2 className="w-4 h-4 text-emerald-400" />,
      color: 'hover:border-emerald-500/50 hover:bg-emerald-950/20',
    },
    {
      type: 'conditional_branch',
      label: 'Conditional Branch',
      desc: 'Splits execution flow based on condition',
      icon: <GitBranch className="w-4 h-4 text-amber-400" />,
      color: 'hover:border-amber-500/50 hover:bg-amber-950/20',
    },
    {
      type: 'delay_timer',
      label: 'Delay Timer',
      desc: 'Suspends step execution for duration',
      icon: <Clock className="w-4 h-4 text-rose-400" />,
      color: 'hover:border-rose-500/50 hover:bg-rose-950/20',
    },
  ];

  return (
    <div className="absolute top-18 left-4 z-20 w-56 bg-slate-900/90 border border-slate-800 rounded-xl p-3 shadow-2xl backdrop-blur-xl space-y-2">
      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800 text-xs font-semibold text-slate-300">
        <span>Node Palette</span>
        <Plus className="w-3.5 h-3.5 text-indigo-400" />
      </div>

      <div className="space-y-1.5">
        {paletteItems.map((item) => (
          <button
            key={item.type}
            onClick={() => onAddNode(item.type)}
            className={`w-full p-2 rounded-lg border border-slate-800 bg-slate-950/60 flex items-start gap-2.5 text-left transition-all duration-150 ${item.color}`}
          >
            <div className="mt-0.5 p-1 rounded bg-slate-900 border border-slate-800">
              {item.icon}
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-200">{item.label}</div>
              <div className="text-[10px] text-slate-400 leading-tight">{item.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};
