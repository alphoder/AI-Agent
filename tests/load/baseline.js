import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ---------------------------------------------------------------------------
// Baseline load test — 50 concurrent VUs, 15-minute steady state
// ---------------------------------------------------------------------------

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

const testUsers = new SharedArray('users', function () {
  return [
    { email: 'learner1@test.com', tenant: 'demo', assignmentId: 'assign-001' },
    { email: 'learner2@test.com', tenant: 'demo', assignmentId: 'assign-002' },
    { email: 'learner3@test.com', tenant: 'demo', assignmentId: 'assign-003' },
    { email: 'learner4@test.com', tenant: 'demo', assignmentId: 'assign-004' },
    { email: 'learner5@test.com', tenant: 'demo', assignmentId: 'assign-005' },
    { email: 'learner6@test.com', tenant: 'demo', assignmentId: 'assign-006' },
    { email: 'learner7@test.com', tenant: 'demo', assignmentId: 'assign-007' },
    { email: 'learner8@test.com', tenant: 'demo', assignmentId: 'assign-008' },
    { email: 'learner9@test.com', tenant: 'demo', assignmentId: 'assign-009' },
    { email: 'learner10@test.com', tenant: 'demo', assignmentId: 'assign-010' },
  ];
});

export const options = {
  scenarios: {
    baseline_steady_state: {
      executor: 'constant-vus',
      vus: 50,
      duration: '15m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],   // P95 latency under 2 seconds
    http_req_failed: ['rate<0.01'],       // Error rate below 1%
    'http_req_duration{name:login}': ['p(95)<1500'],
    'http_req_duration{name:get_dashboard}': ['p(95)<2000'],
    'http_req_duration{name:list_scenarios}': ['p(95)<1500'],
    'http_req_duration{name:create_session}': ['p(95)<2500'],
    'http_req_duration{name:end_session}': ['p(95)<2000'],
    'http_req_duration{name:get_report}': ['p(95)<2000'],
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
// Test flow: login → dashboard → list scenarios → create session → end → report
// ---------------------------------------------------------------------------
export default function () {
  const user = testUsers[__VU % testUsers.length];

  // Step 1: Login via SSO callback (simulated — POST with form data)
  const loginRes = http.post(
    `${BASE_URL}/api/auth/sso/callback`,
    JSON.stringify({
      RelayState: user.tenant,
      SAMLResponse: __ENV.TEST_SAML_RESPONSE || 'mock-saml-response',
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'login' },
      redirects: 0, // Don't follow redirect — capture token from Location header
    },
  );

  check(loginRes, {
    'login returns 302 or 200': (r) => r.status === 302 || r.status === 200,
  });

  // Extract access token (from redirect fragment or response body)
  let accessToken = __ENV.TEST_ACCESS_TOKEN || 'test-token';
  if (loginRes.status === 302) {
    const location = loginRes.headers['Location'] || '';
    const match = location.match(/access_token=([^&]+)/);
    if (match) accessToken = match[1];
  }

  sleep(0.5);

  // Step 2: Get dashboard / user info
  const meRes = http.get(`${BASE_URL}/api/auth/me`, {
    ...getHeaders(accessToken),
    tags: { name: 'get_dashboard' },
  });

  check(meRes, {
    'GET /auth/me returns 200': (r) => r.status === 200,
    'user data present': (r) => {
      try { return JSON.parse(r.body).success === true; } catch { return false; }
    },
  });

  sleep(0.3);

  // Step 3: List scenarios (via analytics overview as proxy)
  const scenariosRes = http.get(`${BASE_URL}/api/analytics/overview`, {
    ...getHeaders(accessToken),
    tags: { name: 'list_scenarios' },
  });

  check(scenariosRes, {
    'GET /analytics/overview returns 200 or 403': (r) =>
      r.status === 200 || r.status === 403,
  });

  sleep(0.3);

  // Step 4: Create a training session
  const createRes = http.post(
    `${BASE_URL}/api/sessions`,
    JSON.stringify({ assignment_id: user.assignmentId }),
    {
      ...getHeaders(accessToken),
      tags: { name: 'create_session' },
    },
  );

  check(createRes, {
    'POST /sessions returns 201 or 400/404/429': (r) =>
      [201, 400, 404, 429].includes(r.status),
  });

  let sessionId = null;
  if (createRes.status === 201) {
    try {
      sessionId = JSON.parse(createRes.body).data.sessionId;
    } catch {
      // parse error — skip
    }
  }

  sleep(1);

  // Step 5: End the session (if created successfully)
  if (sessionId) {
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

    // Step 6: Get the session report
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

// ---------------------------------------------------------------------------
// Custom summary — output JSON alongside the default text summary
// ---------------------------------------------------------------------------
export function handleSummary(data) {
  return {
    stdout: textSummary(data, { indent: '  ', enableColors: true }),
    'results/baseline-summary.json': JSON.stringify(data, null, 2),
  };
}
