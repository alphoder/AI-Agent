import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Rate } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ---------------------------------------------------------------------------
// Spike test — sudden surge from 50 to 200 VUs in 30 seconds
// Validates system stability and recovery under burst traffic
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const recoveryLatency = new Trend('recovery_latency');
const spikeErrors = new Rate('spike_error_rate');

const testUsers = new SharedArray('users', function () {
  return Array.from({ length: 30 }, (_, i) => ({
    email: `spike-learner${i + 1}@test.com`,
    tenant: 'demo',
    assignmentId: `assign-spike-${String(i + 1).padStart(3, '0')}`,
  }));
});

export const options = {
  scenarios: {
    spike_test: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 50 },    // warm up to baseline
        { duration: '30s', target: 200 },   // spike to 4x load
        { duration: '2m', target: 200 },    // sustain spike
        { duration: '1m', target: 50 },     // drop back to baseline
        { duration: '1m', target: 50 },     // observe recovery
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],          // Allow up to 5% errors during spike
    http_req_duration: ['p(99)<5000'],        // P99 under 5s even during spike
    spike_error_rate: ['rate<0.05'],          // Custom spike error metric
    recovery_latency: ['p(95)<2000'],         // Recovery latency P95 under 2s
  },
};

function getHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

export default function () {
  const user = testUsers[__VU % testUsers.length];
  const accessToken = __ENV.TEST_ACCESS_TOKEN || 'test-token';

  // Step 1: Auth check
  const meRes = http.get(`${BASE_URL}/api/auth/me`, {
    ...getHeaders(accessToken),
    tags: { name: 'auth_me' },
  });

  const authOk = check(meRes, {
    'GET /auth/me returns 200': (r) => r.status === 200,
  });

  spikeErrors.add(!authOk);
  recoveryLatency.add(meRes.timings.duration);

  sleep(0.2);

  // Step 2: Fetch scenarios
  const scenariosRes = http.get(`${BASE_URL}/api/scenarios`, {
    ...getHeaders(accessToken),
    tags: { name: 'list_scenarios' },
  });

  const scenariosOk = check(scenariosRes, {
    'GET /scenarios returns 200': (r) => r.status === 200,
  });

  spikeErrors.add(!scenariosOk);
  recoveryLatency.add(scenariosRes.timings.duration);

  sleep(0.2);

  // Step 3: Create session (the most resource-intensive operation)
  const createRes = http.post(
    `${BASE_URL}/api/sessions`,
    JSON.stringify({ assignment_id: user.assignmentId }),
    {
      ...getHeaders(accessToken),
      tags: { name: 'create_session' },
    },
  );

  const createOk = check(createRes, {
    'POST /sessions returns expected status': (r) =>
      [201, 400, 404, 429].includes(r.status),
    'POST /sessions does not return 500': (r) => r.status !== 500,
    'POST /sessions does not return 502': (r) => r.status !== 502,
    'POST /sessions does not return 503': (r) => r.status !== 503,
  });

  spikeErrors.add(!createOk);

  let sessionId = null;
  if (createRes.status === 201) {
    try {
      sessionId = JSON.parse(createRes.body).data.sessionId;
    } catch {
      // skip
    }
  }

  sleep(0.5);

  if (sessionId) {
    // Step 4: End session
    const endRes = http.post(
      `${BASE_URL}/api/sessions/${sessionId}/end`,
      null,
      {
        ...getHeaders(accessToken),
        tags: { name: 'end_session' },
      },
    );

    const endOk = check(endRes, {
      'POST /sessions/:id/end returns 200': (r) => r.status === 200,
      'POST /sessions/:id/end no server error': (r) => r.status < 500,
    });

    spikeErrors.add(!endOk);
    recoveryLatency.add(endRes.timings.duration);

    sleep(0.3);

    // Step 5: Get report (read-heavy, tests DB under load)
    const reportRes = http.get(
      `${BASE_URL}/api/sessions/${sessionId}/report`,
      {
        ...getHeaders(accessToken),
        tags: { name: 'get_report' },
      },
    );

    check(reportRes, {
      'GET /sessions/:id/report returns 200 or 404': (r) =>
        r.status === 200 || r.status === 404,
    });

    recoveryLatency.add(reportRes.timings.duration);
  }

  sleep(0.5);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'results/spike-summary.json': JSON.stringify(data, null, 2),
  };
}
