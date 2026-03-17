import { Page } from '@playwright/test';

/**
 * Simulate admin login by navigating to the SSO callback with a mock admin JWT token.
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  const adminToken = createMockJwt({ role: 'admin', sub: 'admin-user-001', email: 'admin@example.com' });
  await page.goto(`/callback#access_token=${adminToken}`);
  await page.waitForURL('**/admin**', { timeout: 10_000 });
}

/**
 * Simulate learner login by navigating to the SSO callback with a mock learner JWT token.
 */
export async function loginAsLearner(page: Page): Promise<void> {
  const learnerToken = createMockJwt({ role: 'learner', sub: 'learner-user-001', email: 'learner@example.com' });
  await page.goto(`/callback#access_token=${learnerToken}`);
  await page.waitForURL('**/dashboard**', { timeout: 10_000 });
}

/**
 * Set up route interception so that requests matching `url` return the provided mock `response`.
 */
export async function mockApiResponse(
  page: Page,
  url: string,
  response: { status?: number; body: unknown; headers?: Record<string, string> },
): Promise<void> {
  await page.route(url, (route) => {
    route.fulfill({
      status: response.status ?? 200,
      contentType: 'application/json',
      headers: response.headers,
      body: JSON.stringify(response.body),
    });
  });
}

/**
 * Build a fake base64url-encoded JWT for testing purposes.
 * The token is NOT cryptographically valid but carries the expected payload shape.
 */
function createMockJwt(payload: Record<string, unknown>): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encode = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString('base64url');
  return `${encode(header)}.${encode(payload)}.mock_signature`;
}
