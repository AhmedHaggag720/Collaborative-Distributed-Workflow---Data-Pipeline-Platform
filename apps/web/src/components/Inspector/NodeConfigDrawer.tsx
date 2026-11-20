import React, { useState } from 'react';
import type { Node } from '@flowmesh/schema';
import { X, Play, Trash2, Cpu, Globe, Radio, Code2, GitBranch, Clock, Maximize2 } from 'lucide-react';
import { CodeEditorModal } from './CodeEditorModal';

interface NodeConfigDrawerProps {
  node: Node | null;
  onClose: () => void;
  onUpdateConfig: (nodeId: string, updates: Partial<Node>) => void;
  onDeleteNode: (nodeId: string) => void;
}

export const NodeConfigDrawer: React.FC<NodeConfigDrawerProps> = ({
  node,
  onClose,
  onUpdateConfig,
  onDeleteNode,
}) => {
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  if (!node) return null;

  const config = (node.data?.config as any) || {};

  const handleConfigChange = (key: string, val: any) => {
    onUpdateConfig(node.id, {
      data: {
        ...node.data,
        config: {
          ...config,
          [key]: val,
        },
      } as any,
    });
  };

  const handleLabelChange = (label: string) => {
    onUpdateConfig(node.id, {
      data: {
        ...node.data,
        label,
      } as any,
    });
  };

  return (
    <div className="absolute right-0 top-14 bottom-0 w-96 bg-[#0F172A]/95 border-l border-slate-800 backdrop-blur-xl z-30 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <span className="text-[10px] uppercase font-semibold text-indigo-400 tracking-wider">Node Inspector</span>
          <h3 className="text-sm font-bold text-slate-100">{node.data?.label || node.type}</h3>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-slate-800 rounded-md text-slate-400 hover:text-slate-200"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Form Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
        {/* Label Field */}
        <div>
          <label className="block text-slate-400 mb-1 font-medium">Node Display Label</label>
          <input
            type="text"
            value={node.data?.label || ''}
            onChange={(e) => handleLabelChange(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-medium"
          />
        </div>

        {/* Dynamic Type Config */}
        {node.type === 'webhook_trigger' && (
          <div className="space-y-3">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Webhook Endpoint Path</label>
              <input
                type="text"
                value={config.path || '/'}
                onChange={(e) => handleConfigChange('path', e.target.value)}
                placeholder="/orders"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">HTTP Method</label>
              <select
                value={config.method || 'POST'}
                onChange={(e) => handleConfigChange('method', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="POST">POST</option>
                <option value="GET">GET</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Response Ingestion Mode</label>
              <select
                value={config.responseMode || 'immediate_ack'}
                onChange={(e) => handleConfigChange('responseMode', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500"
              >
                <option value="immediate_ack">Immediate 202 Ack (Asynchronous)</option>
                <option value="sync_result">Synchronous Execution Result</option>
              </select>
            </div>
          </div>
        )}

        {node.type === 'http_request' && (
          <div className="space-y-3">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Destination URL</label>
              <input
                type="url"
                value={config.url || ''}
                onChange={(e) => handleConfigChange('url', e.target.value)}
                placeholder="https://api.example.com/v1/resource"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Method</label>
              <select
                value={config.method || 'GET'}
                onChange={(e) => handleConfigChange('method', e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
                <option value="DELETE">DELETE</option>
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Timeout (ms)</label>
              <input
                type="number"
                value={config.timeoutMs || 5000}
                onChange={(e) => handleConfigChange('timeoutMs', Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-indigo-500 font-mono"
              />
            </div>
          </div>
        )}

        {node.type === 'js_code_transform' && (
          <div className="space-y-3">
            <button
              onClick={() => setIsEditorOpen(true)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/80 rounded-lg text-xs font-semibold transition shadow-sm"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Open V8 Code Studio
            </button>
            <div>
              <label className="block text-slate-400 mb-1 font-medium">JavaScript / TypeScript Code Preview</label>
              <textarea
                rows={7}
                value={config.code || ''}
                onChange={(e) => handleConfigChange('code', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-emerald-400 focus:outline-none focus:border-emerald-500 font-mono text-[11px] leading-relaxed resize-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Timeout (ms)</label>
                <input
                  type="number"
                  value={config.timeoutMs || 500}
                  onChange={(e) => handleConfigChange('timeoutMs', Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1 font-medium">Memory (MB)</label>
                <input
                  type="number"
                  value={config.memoryLimitMb || 128}
                  onChange={(e) => handleConfigChange('memoryLimitMb', Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-slate-100 font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {node.type === 'conditional_branch' && (
          <div className="space-y-3">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Condition Boolean Expression</label>
              <textarea
                rows={4}
                value={config.conditionExpression || ''}
                onChange={(e) => handleConfigChange('conditionExpression', e.target.value)}
                placeholder="return Boolean(input.total > 100);"
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-amber-400 focus:outline-none focus:border-amber-500 font-mono text-[11px] resize-none"
              />
            </div>
          </div>
        )}

        {node.type === 'delay_timer' && (
          <div className="space-y-3">
            <div>
              <label className="block text-slate-400 mb-1 font-medium">Delay Duration (ms)</label>
              <input
                type="number"
                value={config.delayMs || 1000}
                onChange={(e) => handleConfigChange('delayMs', Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-slate-100 font-mono"
              />
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-slate-800 flex items-center justify-between">
        <button
          onClick={() => onDeleteNode(node.id)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 rounded-lg text-xs font-semibold transition"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Node
        </button>
        <button
          onClick={onClose}
          className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold transition"
        >
          Done
        </button>
      </div>

      {/* Fullscreen Code Editor Studio Modal */}
      {isEditorOpen && (
        <CodeEditorModal
          node={node}
          isOpen={isEditorOpen}
          onClose={() => setIsEditorOpen(false)}
          onSave={(newCode, newTimeout, newMemory) => {
            onUpdateConfig(node.id, {
              data: {
                ...node.data,
                config: {
                  ...config,
                  code: newCode,
                  timeoutMs: newTimeout,
                  memoryLimitMb: newMemory,
                },
              } as any,
            });
          }}
        />
      )}
    </div>
  );
};
