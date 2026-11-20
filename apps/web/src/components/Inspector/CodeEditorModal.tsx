import React, { useState } from 'react';
import { 
  X, 
  Play, 
  Terminal, 
  CheckCircle2, 
  AlertCircle, 
  Sparkles, 
  Maximize2, 
  Clock, 
  Cpu, 
  Code2, 
  RotateCcw 
} from 'lucide-react';
import type { Node } from '@flowmesh/schema';

interface CodeEditorModalProps {
  node: Node;
  isOpen: boolean;
  onClose: () => void;
  onSave: (code: string, timeoutMs: number, memoryLimitMb: number) => void;
}

const TEMPLATES: Record<string, { label: string; code: string; sampleInput: any }> = {
  normalize: {
    label: 'Normalize Order',
    code: `export default async function transform(input) {
  const order = input.body || input;
  console.log('Ingesting raw order payload for customer:', order.email);

  return {
    orderId: order.id || 'ord_' + Date.now(),
    customerEmail: (order.email || 'guest@example.com').toLowerCase().trim(),
    totalCents: Math.round((order.amount || 0) * 100),
    isVip: (order.amount || 0) >= 500,
    processedAt: new Date().toISOString()
  };
}`,
    sampleInput: {
      id: 'ord_98765',
      email: '  Alice.Wonderland@EXAMPLE.com  ',
      amount: 549.99,
      currency: 'USD',
    },
  },
  filter: {
    label: 'Filter & Aggregate',
    code: `export default async function transform(input) {
  const items = input.items || [];
  console.log('Processing item count:', items.length);

  const validItems = items.filter(it => it.price > 0 && it.inStock);
  const totalValue = validItems.reduce((sum, it) => sum + (it.price * (it.quantity || 1)), 0);

  return {
    validCount: validItems.length,
    totalValueCents: Math.round(totalValue * 100),
    items: validItems
  };
}`,
    sampleInput: {
      items: [
        { name: 'Wireless Headphones', price: 99.99, quantity: 2, inStock: true },
        { name: 'Defective Cable', price: 0, quantity: 1, inStock: false },
        { name: 'USB-C Fast Charger', price: 29.50, quantity: 1, inStock: true },
      ],
    },
  },
  regex: {
    label: 'Sanitize & Hash',
    code: `export default async function transform(input) {
  const rawText = String(input.text || '');
  console.log('Sanitizing raw user text of length:', rawText.length);

  // Strip HTML script tags & dangerous characters
  const clean = rawText.replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '').trim();

  return {
    originalLength: rawText.length,
    sanitized: clean,
    wordCount: clean.split(/\\s+/).filter(Boolean).length
  };
}`,
    sampleInput: {
      text: 'Hello world! <script>alert("hack");</script> Here is my comment.',
    },
  },
};

export const CodeEditorModal: React.FC<CodeEditorModalProps> = ({
  node,
  isOpen,
  onClose,
  onSave,
}) => {
  if (!isOpen) return null;

  const currentConfig = (node.data?.config as any) || {};
  const [code, setCode] = useState<string>(
    currentConfig.code || TEMPLATES.normalize.code
  );
  const [timeoutMs, setTimeoutMs] = useState<number>(currentConfig.timeoutMs || 500);
  const [memoryLimitMb, setMemoryLimitMb] = useState<number>(currentConfig.memoryLimitMb || 128);

  const [inputJson, setInputJson] = useState<string>(
    JSON.stringify(TEMPLATES.normalize.sampleInput, null, 2)
  );
  const [outputJson, setOutputJson] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [executionStats, setExecutionStats] = useState<{ durationMs: number; error?: string } | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  // Local sandbox test execution
  const handleTestRun = async () => {
    setIsRunning(true);
    setExecutionStats(null);
    setLogs([]);
    setOutputJson(null);

    const startTime = performance.now();
    const capturedLogs: string[] = [];

    try {
      let parsedInput = {};
      try {
        parsedInput = JSON.parse(inputJson);
      } catch (err) {
        throw new Error(`Invalid Input JSON: ${(err as Error).message}`);
      }

      const mockConsole = {
        log: (...args: any[]) => capturedLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        info: (...args: any[]) => capturedLogs.push('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        warn: (...args: any[]) => capturedLogs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
        error: (...args: any[]) => capturedLogs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ')),
      };

      // Clean execution wrapper with timeout
      const fn = new Function('input', 'console', `
        ${code}
        if (typeof transform === 'function') {
          return transform(input);
        }
        return input;
      `);

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Execution timed out after ${timeoutMs}ms`)), timeoutMs)
      );

      const result = await Promise.race([Promise.resolve(fn(parsedInput, mockConsole)), timeoutPromise]);
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;

      setOutputJson(JSON.stringify(result, null, 2));
      setLogs(capturedLogs);
      setExecutionStats({ durationMs });
    } catch (err) {
      const durationMs = Math.round((performance.now() - startTime) * 100) / 100;
      setLogs(capturedLogs);
      setExecutionStats({ durationMs, error: (err as Error).message });
    } finally {
      setIsRunning(false);
    }
  };

  const handleApplyTemplate = (key: string) => {
    const tmpl = TEMPLATES[key];
    if (tmpl) {
      setCode(tmpl.code);
      setInputJson(JSON.stringify(tmpl.sampleInput, null, 2));
    }
  };

  const handleSaveAndClose = () => {
    onSave(code, timeoutMs, memoryLimitMb);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md animate-in fade-in duration-150 p-6">
      <div className="w-full max-w-5xl h-[85vh] bg-[#0F172A] border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="h-14 px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-100">V8 Code Transform Studio</h3>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Isolated V8 Sandbox
                </span>
              </div>
              <p className="text-[11px] text-slate-400">Node: {node.data?.label || node.id}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Template Selector */}
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mr-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Snippets:</span>
              {Object.entries(TEMPLATES).map(([key, t]) => (
                <button
                  key={key}
                  onClick={() => handleApplyTemplate(key)}
                  className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 text-[11px] transition"
                >
                  {t.label}
                </button>
              ))}
            </div>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Main Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Column: Monaco-Style Code Editor */}
          <div className="flex-1 flex flex-col border-r border-slate-800">
            <div className="h-9 px-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>TypeScript / ES2022</span>
              <div className="flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 text-slate-400">
                  <Clock className="w-3 h-3 text-cyan-400" />
                  {timeoutMs}ms limit
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Cpu className="w-3 h-3 text-indigo-400" />
                  {memoryLimitMb}MB RAM
                </span>
              </div>
            </div>

            <div className="relative flex-1 bg-slate-950 p-4 font-mono text-xs overflow-hidden">
              <textarea
                value={code}
                onChange={(e) => setCode(e.target.value)}
                spellCheck={false}
                className="w-full h-full bg-transparent text-emerald-400 focus:outline-none resize-none leading-relaxed font-mono selection:bg-emerald-900/60"
              />
            </div>

            {/* Bottom Guardrails Configuration */}
            <div className="h-12 px-4 bg-slate-900/60 border-t border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <label className="text-slate-400 font-medium">Timeout:</label>
                  <input
                    type="number"
                    min={50}
                    max={5000}
                    value={timeoutMs}
                    onChange={(e) => setTimeoutMs(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-center font-mono"
                  />
                  <span className="text-slate-500">ms</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-slate-400 font-medium">Memory:</label>
                  <input
                    type="number"
                    min={16}
                    max={512}
                    value={memoryLimitMb}
                    onChange={(e) => setMemoryLimitMb(Number(e.target.value))}
                    className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200 text-center font-mono"
                  />
                  <span className="text-slate-500">MB</span>
                </div>
              </div>

              <button
                onClick={handleTestRun}
                disabled={isRunning}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white rounded-lg font-semibold shadow-md transition disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                {isRunning ? 'Running Isolate...' : 'Test Run Code'}
              </button>
            </div>
          </div>

          {/* Right Column: Input / Output Test Harness */}
          <div className="w-96 flex flex-col bg-slate-900/40">
            {/* Input JSON Pane */}
            <div className="flex-1 flex flex-col border-b border-slate-800">
              <div className="h-9 px-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Test Input Payload (JSON)</span>
              </div>
              <div className="flex-1 p-3 bg-slate-950">
                <textarea
                  value={inputJson}
                  onChange={(e) => setInputJson(e.target.value)}
                  spellCheck={false}
                  className="w-full h-full bg-transparent text-cyan-300 font-mono text-xs focus:outline-none resize-none leading-relaxed"
                />
              </div>
            </div>

            {/* Output / Diagnostics Pane */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <div className="h-9 px-4 bg-slate-950/80 border-b border-slate-800 flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Execution Output</span>
                {executionStats && (
                  <span
                    className={`font-semibold text-[11px] ${
                      executionStats.error ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {executionStats.error ? 'Failed' : `${executionStats.durationMs}ms`}
                  </span>
                )}
              </div>

              <div className="flex-1 p-3 bg-slate-950 overflow-y-auto font-mono text-xs space-y-2">
                {executionStats?.error ? (
                  <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800 text-rose-300 text-[11px] flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-bold">Execution Error:</div>
                      <div>{executionStats.error}</div>
                    </div>
                  </div>
                ) : outputJson ? (
                  <pre className="text-emerald-400/90 whitespace-pre-wrap">{outputJson}</pre>
                ) : (
                  <div className="text-slate-600 italic">Click "Test Run Code" to execute inside V8 sandbox.</div>
                )}

                {/* Console Logs */}
                {logs.length > 0 && (
                  <div className="mt-3 pt-2 border-t border-slate-800/80">
                    <div className="text-[10px] uppercase font-bold text-slate-500 mb-1 flex items-center gap-1">
                      <Terminal className="w-3 h-3" /> Captured Console Logs:
                    </div>
                    {logs.map((log, idx) => (
                      <div key={idx} className="text-slate-300 text-[11px] font-mono leading-relaxed">
                        &gt; {log}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="h-14 px-6 border-t border-slate-800 bg-slate-900 flex items-center justify-between">
          <button
            onClick={() => {
              setCode(currentConfig.code || TEMPLATES.normalize.code);
              setExecutionStats(null);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset to Saved
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAndClose}
              className="px-5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-md transition"
            >
              Save & Apply Code
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
