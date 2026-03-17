import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ---------------------------------------------------------------------------
// Ramp-up load test — 0 → 120 VUs over 10 min, hold 5 min, ramp down
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const testUsers = new SharedArray('users', function () {
  return Array.from({ length: 20 }, (_, i) => ({
    email: `ramp-learner${i + 1}@test.com`,
    tenant: 'demo',
    assignmentId: `assign-ramp-${String(i + 1).padStart(3, '0')}`,
  }));
});

export const options = {
  scenarios: {
    ramp_up_down: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 30 },   // warm-up
        { duration: '3m', target: 60 },   // ramp to moderate load
        { duration: '3m', target: 120 },  // ramp to peak
        { duration: '5m', target: 120 },  // hold at peak
        { duration: '2m', target: 0 },    // ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2500'],    // P95 latency under 2.5s at peak
    http_req_failed: ['rate<0.02'],        // Error rate below 2%
    'http_req_duration{name:auth_me}': ['p(95)<2000'],
    'http_req_duration{name:create_session}': ['p(95)<3000'],
    'http_req_duration{name:end_session}': ['p(95)<2500'],
    'http_req_duration{name:get_transcript}': ['p(95)<2500'],
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

  // Step 1: Authenticate — GET /api/auth/me
  const meRes = http.get(`${BASE_URL}/api/auth/me`, {
    ...getHeaders(accessToken),
    tags: { name: 'auth_me' },
  });

  check(meRes, {
    'GET /auth/me status 200': (r) => r.status === 200,
  });

  sleep(0.5);

  // Step 2: List avatars
  const avatarsRes = http.get(`${BASE_URL}/api/avatars`, {
    ...getHeaders(accessToken),
    tags: { name: 'list_avatars' },
  });

  check(avatarsRes, {
    'GET /avatars returns 200': (r) => r.status === 200,
  });

  sleep(0.3);

  // Step 3: List personas
  const personasRes = http.get(`${BASE_URL}/api/personas`, {
    ...getHeaders(accessToken),
    tags: { name: 'list_personas' },
  });

  check(personasRes, {
    'GET /personas returns 200': (r) => r.status === 200,
  });

  sleep(0.3);

  // Step 4: List scenarios
  const scenariosRes = http.get(`${BASE_URL}/api/scenarios`, {
    ...getHeaders(accessToken),
    tags: { name: 'list_scenarios' },
  });

  check(scenariosRes, {
    'GET /scenarios returns 200': (r) => r.status === 200,
  });

  sleep(0.3);

  // Step 5: Create session
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
    // Step 6: Get session details
    const sessionRes = http.get(`${BASE_URL}/api/sessions/${sessionId}`, {
      ...getHeaders(accessToken),
      tags: { name: 'get_session' },
    });

    check(sessionRes, {
      'GET /sessions/:id returns 200': (r) => r.status === 200,
    });

    sleep(0.5);

    // Step 7: End session
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

    sleep(0.5);

    // Step 8: Get transcript
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

    sleep(0.5);

    // Step 9: Get report
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
  }

  sleep(1);
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'results/ramp-summary.json': JSON.stringify(data, null, 2),
  };
}
