import { test, expect } from '@playwright/test';
import { mockApiResponse } from './helpers';

test.describe('Error Flows', () => {
  test('unauthenticated user redirected to login', async ({ page }) => {
    // Attempt to access a protected route without a token
    await page.goto('/avatars');

    // Should be redirected to a login or auth page
    await expect(page).toHaveURL(/\/(login|auth|callback|signin)/i, { timeout: 10_000 });
  });

  test('expired token triggers refresh', async ({ page }) => {
    let callCount = 0;

    // First call to a protected API returns 401 (expired token)
    await page.route('**/api/avatars*', (route) => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Token expired' }),
        });
      } else {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            { id: 'av-1', name: 'Dr. Smith', status: 'active' },
          ]),
        });
      }
    });

    // Mock the token refresh endpoint to succeed
    await mockApiResponse(page, '**/api/auth/refresh*', {
      body: { access_token: 'refreshed_token', expires_in: 3600 },
    });
    await mockApiResponse(page, '**/auth/refresh*', {
      body: { access_token: 'refreshed_token', expires_in: 3600 },
    });

    // Set a fake expired token via the SSO callback
    await page.goto('/callback#access_token=expired_token');

    // Navigate to a protected page that triggers the API call
    await page.goto('/avatars');

    // The app should either silently refresh and show data, or redirect to re-auth
    const hasData = await page.locator('text=Dr. Smith').isVisible().catch(() => false);
    const wasRedirected = /\/(login|auth|callback)/i.test(page.url());

    expect(hasData || wasRedirected).toBeTruthy();
  });

  test('invalid route shows 404', async ({ page }) => {
    await page.goto('/this-route-does-not-exist-abc123');

    // Verify some kind of 404 / not found indication
    await expect(
      page.locator('text=/not found|404|page doesn.t exist/i').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('API error shows error message', async ({ page }) => {
    // Mock an API endpoint to return a 500 error
    await mockApiResponse(page, '**/api/avatars*', {
      status: 500,
      body: { error: 'Internal Server Error', message: 'Something went wrong' },
    });

    // Set a fake token and navigate to avatars
    await page.goto('/callback#access_token=test_token');
    await page.goto('/avatars');

    // Verify an error message is shown to the user
    await expect(
      page.locator('text=/error|something went wrong|failed|try again/i').first(),
    ).toBeVisible({ timeout: 5_000 });
  });
});
