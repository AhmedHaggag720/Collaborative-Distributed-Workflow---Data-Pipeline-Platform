import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 concurrent virtual users
    { duration: '1m', target: 100 },  // Maintain 100 concurrent virtual users
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<250', 'p(99)<500'], // 95% of requests under 250ms
    http_req_failed: ['rate<0.01'],                 // Error rate < 1%
  },
};

export default function () {
  const url = __ENV.API_URL || 'http://localhost:4000/hooks/test-workflow-id';
  const payload = JSON.stringify({
    orderId: `ord_${__VU}_${__ITER}`,
    customerEmail: 'stress-test@flowmesh.dev',
    amount: (Math.random() * 500).toFixed(2),
    timestamp: new Date().toISOString(),
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const res = http.post(url, payload, params);

  check(res, {
    'status is 202 (Accepted) or 200': (r) => r.status === 202 || r.status === 200,
    'has runId': (r) => {
      try {
        const body = JSON.parse(r.body);
        return Boolean(body.runId);
      } catch {
        return false;
      }
    },
  });

  sleep(0.1);
}
