import React, { useState } from 'react';
import { 
  X, 
  Terminal, 
  Clock, 
  Cpu, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  FileJson,
  Layers
} from 'lucide-react';
import type { TelemetryNodeState } from '../../lib/telemetry/useLiveTelemetry';

interface ExecutionInspectorDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  nodeName: string;
  nodeType: string;
  telemetryState?: TelemetryNodeState;
  onReplayStep?: (stepId: string) => Promise<void>;
}

export const ExecutionInspectorDrawer: React.FC<ExecutionInspectorDrawerProps> = ({
  isOpen,
  onClose,
  nodeName,
  nodeType,
  telemetryState,
  onReplayStep,
}) => {
  const [activeTab, setActiveTab] = useState<'payload' | 'logs'>('payload');
  const [isCopied, setIsCopied] = useState(false);
  const [isReplaying, setIsReplaying] = useState(false);

  if (!isOpen) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleReplay = async () => {
    if (!telemetryState?.stepId || !onReplayStep) return;
    setIsReplaying(true);
    try {
      await onReplayStep(telemetryState.stepId);
    } finally {
      setIsReplaying(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 w-[480px] bg-slate-950/95 border-l border-slate-800 backdrop-blur-xl shadow-2xl z-50 flex flex-col transition-transform duration-200">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-100">{nodeName}</h3>
            <p className="text-xs text-slate-400 capitalize">{nodeType.replace('_', ' ')} Execution Trace</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Execution Status Bar */}
      <div className="p-4 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {telemetryState?.status === 'running' && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-mono font-medium">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping inline-block" />
              RUNNING
            </span>
          )}
          {telemetryState?.status === 'completed' && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-mono font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              COMPLETED
            </span>
          )}
          {(telemetryState?.status === 'failed' || telemetryState?.status === 'dlq') && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-rose-950 text-rose-300 border border-rose-500/40 font-mono font-medium">
              <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
              {telemetryState.status === 'dlq' ? 'DEAD-LETTER QUEUE' : 'FAILED'}
            </span>
          )}
          {!telemetryState && (
            <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 font-mono">
              NO RECENT RUN
            </span>
          )}
        </div>

        {telemetryState?.durationMs !== undefined && (
          <div className="flex items-center gap-1 text-slate-400 font-mono">
            <Clock className="w-3.5 h-3.5" />
            <span>{telemetryState.durationMs}ms</span>
          </div>
        )}
      </div>

      {/* Trace Metadata */}
      {telemetryState && (
        <div className="p-4 bg-slate-900/30 border-b border-slate-800/80 grid grid-cols-2 gap-2 text-[11px] font-mono">
          <div>
            <span className="text-slate-500">Trace ID:</span>
            <div className="text-slate-300 truncate" title={telemetryState.traceId}>
              {telemetryState.traceId || 'N/A'}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Span ID:</span>
            <div className="text-slate-300 truncate" title={telemetryState.spanId}>
              {telemetryState.spanId || 'N/A'}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Step ID:</span>
            <div className="text-slate-300 truncate" title={telemetryState.stepId}>
              {telemetryState.stepId || 'N/A'}
            </div>
          </div>
          <div>
            <span className="text-slate-500">Run ID:</span>
            <div className="text-slate-300 truncate" title={telemetryState.runId}>
              {telemetryState.runId || 'N/A'}
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {telemetryState?.error && (
        <div className="p-3 m-4 mb-0 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="font-mono text-[11px] break-all">{telemetryState.error}</div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-slate-800 px-4 mt-2">
        <button
          onClick={() => setActiveTab('payload')}
          className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'payload'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileJson className="w-3.5 h-3.5" />
          Payloads
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`py-2 px-3 text-xs font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
            activeTab === 'logs'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-3.5 h-3.5" />
          Console Logs ({telemetryState?.logs?.length || 0})
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'payload' ? (
          <>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-300">Input Payload</span>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(telemetryState?.inputPayload || {}, null, 2))
                  }
                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-400/90 overflow-x-auto max-h-48">
                {JSON.stringify(telemetryState?.inputPayload || {}, null, 2)}
              </pre>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-300">Output Payload</span>
                <button
                  onClick={() =>
                    copyToClipboard(JSON.stringify(telemetryState?.outputPayload || {}, null, 2))
                  }
                  className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  Copy
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-slate-900 border border-slate-800 text-[11px] font-mono text-indigo-400/90 overflow-x-auto max-h-56">
                {JSON.stringify(telemetryState?.outputPayload || {}, null, 2)}
              </pre>
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">Captured Execution Logs</span>
              <button
                onClick={() => copyToClipboard((telemetryState?.logs || []).join('\n'))}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                {isCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                Copy Logs
              </button>
            </div>
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] min-h-[200px] max-h-[380px] overflow-y-auto space-y-1">
              {(telemetryState?.logs || []).length === 0 ? (
                <div className="text-slate-600 italic">No console logs emitted for this step.</div>
              ) : (
                telemetryState?.logs?.map((line, idx) => (
                  <div key={idx} className="text-slate-300 flex items-start gap-2">
                    <span className="text-slate-600 select-none">{idx + 1}</span>
                    <span className="break-all">{line}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      {(telemetryState?.status === 'dlq' || telemetryState?.status === 'failed') && (
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex justify-end">
          <button
            onClick={handleReplay}
            disabled={isReplaying}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs shadow-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isReplaying ? 'animate-spin' : ''}`} />
            {isReplaying ? 'Replaying Step...' : 'Replay Step from DLQ'}
          </button>
        </div>
      )}
    </div>
  );
};
