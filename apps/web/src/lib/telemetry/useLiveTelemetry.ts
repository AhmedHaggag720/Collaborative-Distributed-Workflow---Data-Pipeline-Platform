import { useState, useEffect, useCallback, useRef } from 'react';

export interface TelemetryNodeState {
  status: 'running' | 'completed' | 'failed' | 'retrying' | 'dlq';
  durationMs?: number;
  runId: string;
  stepId: string;
  nodeId: string;
  timestamp: string;
  traceId?: string;
  spanId?: string;
  error?: string | null;
  outputPayload?: unknown;
  inputPayload?: unknown;
  logs?: string[];
}

export interface NodeMetrics {
  nodeId: string;
  totalRuns: number;
  completed: number;
  failed: number;
  p50: number;
  p95: number;
  p99: number;
  avgDuration: number;
}

export function useLiveTelemetry(workflowId?: string, apiBaseUrl = 'http://localhost:4000') {
  const [isConnected, setIsConnected] = useState(false);
  const [nodeStatuses, setNodeStatuses] = useState<Record<string, TelemetryNodeState>>({});
  const [metrics, setMetrics] = useState<Record<string, NodeMetrics>>({});
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [eventCount, setEventCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Fetch aggregate p50/p95/p99 metrics from API
  const refreshMetrics = useCallback(async (wfId?: string) => {
    const id = wfId || workflowId;
    if (!id) return;
    try {
      const res = await fetch(`${apiBaseUrl}/api/telemetry/metrics/${id}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data) {
          setMetrics(json.data);
        }
      }
    } catch {
      // API may not be reachable in demo mode
    }
  }, [workflowId, apiBaseUrl]);

  // Connect to SSE stream
  useEffect(() => {
    let es: EventSource | null = null;
    let reconnectTimeout: any;

    function connect() {
      try {
        es = new EventSource(`${apiBaseUrl}/api/telemetry/stream`);
        eventSourceRef.current = es;

        es.addEventListener('connected', () => {
          setIsConnected(true);
        });

        es.addEventListener('telemetry', (e) => {
          try {
            const data = JSON.parse(e.data);
            setEventCount((prev) => prev + 1);

            if (data.runId) {
              setActiveRunId(data.runId);
            }

            if (data.nodeId) {
              setNodeStatuses((prev) => ({
                ...prev,
                [data.nodeId]: {
                  nodeId: data.nodeId,
                  status:
                    data.eventType === 'step_started'
                      ? 'running'
                      : data.eventType === 'step_completed'
                      ? 'completed'
                      : data.eventType === 'step_dlq'
                      ? 'dlq'
                      : 'failed',
                  durationMs: data.durationMs,
                  runId: data.runId,
                  stepId: data.stepId,
                  timestamp: data.timestamp,
                  traceId: data.traceId,
                  spanId: data.spanId,
                  error: data.error,
                  outputPayload: data.outputPayload,
                  inputPayload: data.inputPayload,
                  logs: data.logs,
                },
              }));
            }
          } catch {
            // Ignore malformed event
          }
        });

        es.onerror = () => {
          setIsConnected(false);
          es?.close();
          reconnectTimeout = setTimeout(connect, 3000);
        };
      } catch {
        setIsConnected(false);
      }
    }

    connect();
    refreshMetrics();

    return () => {
      clearTimeout(reconnectTimeout);
      es?.close();
    };
  }, [apiBaseUrl, refreshMetrics]);

  // Trigger test workflow execution
  const triggerWorkflowRun = useCallback(
    async (payload = { source: 'dashboard_manual_trigger', timestamp: new Date().toISOString() }) => {
      if (!workflowId) return null;
      try {
        const res = await fetch(`${apiBaseUrl}/hooks/${workflowId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const json = await res.json();
          if (json.runId) {
            setActiveRunId(json.runId);
            // Reset node statuses for fresh visual run
            setNodeStatuses({});
          }
          return json;
        }
      } catch (err) {
        console.error('Failed to trigger workflow:', err);
      }
      return null;
    },
    [workflowId, apiBaseUrl]
  );

  // Replay a step from DLQ
  const replayDlqStep = useCallback(
    async (stepId: string) => {
      try {
        const res = await fetch(`${apiBaseUrl}/api/dlq/replay/${stepId}`, {
          method: 'POST',
        });
        if (res.ok) {
          return await res.json();
        }
      } catch (err) {
        console.error('Failed to replay DLQ step:', err);
      }
      return null;
    },
    [apiBaseUrl]
  );

  return {
    isConnected,
    nodeStatuses,
    metrics,
    activeRunId,
    eventCount,
    refreshMetrics,
    triggerWorkflowRun,
    replayDlqStep,
    setNodeStatuses,
  };
}
