import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '20s', target: 20 },  // Ramp-up to 20 VUs
    { duration: '1m', target: 50 },   // Sustain 50 concurrent pipeline runs
    { duration: '20s', target: 0 },   // Ramp-down
  ],
  thresholds: {
    http_req_duration: ['p(95)<400', 'p(99)<800'], // p95 under 400ms
    http_req_failed: ['rate<0.02'],                // < 2% error rate
  },
};

export default function () {
  const apiBase = __ENV.API_URL || 'http://localhost:4000';
  const workflowId = __ENV.WORKFLOW_ID || 'demo-load-workflow';

  // 1. Ingress Trigger
  const triggerRes = http.post(
    `${apiBase}/hooks/${workflowId}`,
    JSON.stringify({
      orderId: `stress_ord_${__VU}_${__ITER}`,
      amount: Math.round(Math.random() * 50000),
      items: ['sku_apple', 'sku_laptop'],
      timestamp: new Date().toISOString(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Tenant-Id': `tenant_${__VU % 5}`, // 5 simulated tenants
      },
    }
  );

  check(triggerRes, {
    'trigger status 202': (r) => r.status === 202,
    'runId received': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.runId);
      } catch {
        return false;
      }
    },
  });

  const runId = triggerRes.json('runId');

  // 2. Poll Execution Run Status until completion (or max 5 iterations)
  if (runId) {
    let completed = false;
    for (let i = 0; i < 5; i++) {
      sleep(0.5);
      const statusRes = http.get(`${apiBase}/api/runs/${runId}`);
      if (statusRes.status === 200) {
        const data = statusRes.json('data');
        if (data && (data.status === 'completed' || data.status === 'failed')) {
          completed = true;
          check(statusRes, {
            'run completed successfully': () => data.status === 'completed',
          });
          break;
        }
      }
    }
  }

  sleep(0.2);
}
