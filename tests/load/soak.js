import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Trend, Counter } from 'k6/metrics';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ---------------------------------------------------------------------------
// Soak test — 80 VUs for 4 hours
// Detects memory leaks, connection pool exhaustion, and latency degradation
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

// Custom metrics for tracking stability over time
const latencyTrend = new Trend('soak_latency_trend');
const memoryCheckLatency = new Trend('memory_check_latency');
const iterationErrors = new Counter('soak_iteration_errors');

const testUsers = new SharedArray('users', function () {
  return Array.from({ length: 25 }, (_, i) => ({
    email: `soak-learner${i + 1}@test.com`,
    tenant: 'demo',
    assignmentId: `assign-soak-${String(i + 1).padStart(3, '0')}`,
  }));
});

export const options = {
  scenarios: {
    soak_test: {
      executor: 'constant-vus',
      vus: 80,
      duration: '4h',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2500'],         // P95 stays under 2.5s
    http_req_failed: ['rate<0.01'],             // Error rate under 1%
    soak_latency_trend: ['p(95)<2500'],         // Custom trend tracks stability
    memory_check_latency: ['p(95)<3000'],       // Health checks stay responsive
    soak_iteration_errors: ['count<500'],        // Total error count cap
    'http_req_duration{name:health_check}': ['p(99)<1000'],
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

// ---------------------------------------------------------------------------
// Periodic health/memory probe — runs every ~60 iterations to detect leaks
// ---------------------------------------------------------------------------
function healthProbe() {
  const healthRes = http.get(`${BASE_URL}/health`, {
    tags: { name: 'health_check' },
    timeout: '10s',
  });

  const ok = check(healthRes, {
    'health endpoint responsive': (r) => r.status === 200,
    'health response under 1s': (r) => r.timings.duration < 1000,
  });

  memoryCheckLatency.add(healthRes.timings.duration);

  if (!ok) {
    iterationErrors.add(1);
  }

  return ok;
}

export default function () {
  const user = testUsers[__VU % testUsers.length];
  const accessToken = __ENV.TEST_ACCESS_TOKEN || 'test-token';
  const iteration = __ITER;

  // Periodic health probe (every 60 iterations per VU)
  if (iteration % 60 === 0) {
    healthProbe();
  }

  // Step 1: Auth check
  const meRes = http.get(`${BASE_URL}/api/auth/me`, {
    ...getHeaders(accessToken),
    tags: { name: 'auth_me' },
  });

  const meOk = check(meRes, {
    'GET /auth/me returns 200': (r) => r.status === 200,
  });

  latencyTrend.add(meRes.timings.duration);
  if (!meOk) iterationErrors.add(1);

  sleep(0.5);

  // Step 2: List scenarios
  const scenariosRes = http.get(`${BASE_URL}/api/scenarios`, {
    ...getHeaders(accessToken),
    tags: { name: 'list_scenarios' },
  });

  check(scenariosRes, {
    'GET /scenarios returns 200': (r) => r.status === 200,
  });

  latencyTrend.add(scenariosRes.timings.duration);

  sleep(0.3);

  // Step 3: List personas
  const personasRes = http.get(`${BASE_URL}/api/personas`, {
    ...getHeaders(accessToken),
    tags: { name: 'list_personas' },
  });

  check(personasRes, {
    'GET /personas returns 200': (r) => r.status === 200,
  });

  latencyTrend.add(personasRes.timings.duration);

  sleep(0.3);

  // Step 4: Create session
  const createRes = http.post(
    `${BASE_URL}/api/sessions`,
    JSON.stringify({ assignment_id: user.assignmentId }),
    {
      ...getHeaders(accessToken),
      tags: { name: 'create_session' },
    },
  );

  check(createRes, {
    'POST /sessions returns expected status': (r) =>
      [201, 400, 404, 429].includes(r.status),
  });

  latencyTrend.add(createRes.timings.duration);

  let sessionId = null;
  if (createRes.status === 201) {
    try {
      sessionId = JSON.parse(createRes.body).data.sessionId;
    } catch {
      // skip
    }
  }

  sleep(1);

  if (sessionId) {
    // Step 5: Get session details
    const sessionRes = http.get(`${BASE_URL}/api/sessions/${sessionId}`, {
      ...getHeaders(accessToken),
      tags: { name: 'get_session' },
    });

    check(sessionRes, {
      'GET /sessions/:id returns 200': (r) => r.status === 200,
    });

    latencyTrend.add(sessionRes.timings.duration);

    sleep(0.5);

    // Step 6: End session
    const endRes = http.post(
      `${BASE_URL}/api/sessions/${sessionId}/end`,
      null,
      {
        ...getHeaders(accessToken),
        tags: { name: 'end_session' },
      },
    );

    check(endRes, {
      'POST /sessions/:id/end returns 200': (r) => r.status === 200,
    });

    latencyTrend.add(endRes.timings.duration);

    sleep(0.5);

    // Step 7: Get transcript
    const transcriptRes = http.get(
      `${BASE_URL}/api/sessions/${sessionId}/transcript`,
      {
        ...getHeaders(accessToken),
        tags: { name: 'get_transcript' },
      },
    );

    check(transcriptRes, {
      'GET /sessions/:id/transcript returns 200': (r) => r.status === 200,
    });

    latencyTrend.add(transcriptRes.timings.duration);

    sleep(0.5);

    // Step 8: Get report
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

    latencyTrend.add(reportRes.timings.duration);
  }

  // Longer think time for soak test to simulate realistic user behavior
  sleep(2 + Math.random() * 3);
}

export function handleSummary(data) {
  // Extract latency stability metrics
  const p95Values = data.metrics?.soak_latency_trend?.values || {};
  const summary = {
    test_type: 'soak',
    duration: '4h',
    vus: 80,
    p95_latency: p95Values['p(95)'] || null,
    p99_latency: p95Values['p(99)'] || null,
    total_errors: data.metrics?.soak_iteration_errors?.values?.count || 0,
    total_requests: data.metrics?.http_reqs?.values?.count || 0,
  };

  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'results/soak-summary.json': JSON.stringify(data, null, 2),
    'results/soak-stability.json': JSON.stringify(summary, null, 2),
  };
}
