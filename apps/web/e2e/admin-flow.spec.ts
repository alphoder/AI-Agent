import { test, expect } from '@playwright/test';
import { loginAsAdmin, mockApiResponse } from './helpers';

test.describe('Admin Flow', () => {
  test('admin can login via SSO callback', async ({ page }) => {
    await page.goto('/callback#access_token=test_admin_token');

    // After SSO callback the user should be redirected to the admin dashboard
    await page.waitForURL('**/admin**', { timeout: 10_000 });
    await expect(page).toHaveURL(/\/admin/);
  });

  test('admin can view avatars list', async ({ page }) => {
    await mockApiResponse(page, '**/api/avatars*', {
      body: [
        { id: 'av-1', name: 'Dr. Smith', voice: 'en-US-male', status: 'active' },
        { id: 'av-2', name: 'Prof. Jones', voice: 'en-US-female', status: 'active' },
      ],
    });

    await loginAsAdmin(page);
    await page.goto('/avatars');

    // Verify avatars table renders with expected data
    await expect(page.locator('table, [data-testid="avatars-list"]')).toBeVisible();
    await expect(page.locator('text=Dr. Smith')).toBeVisible();
    await expect(page.locator('text=Prof. Jones')).toBeVisible();
  });

  test('admin can create avatar', async ({ page }) => {
    await mockApiResponse(page, '**/api/avatars', {
      status: 201,
      body: { id: 'av-new', name: 'New Avatar', voice: 'en-US-male' },
    });

    await loginAsAdmin(page);
    await page.goto('/avatars/create');

    // Fill out the avatar creation form
    await page.locator('input[name="name"], [data-testid="avatar-name"]').fill('New Avatar');
    await page.locator('input[name="voice"], select[name="voice"], [data-testid="avatar-voice"]').first().click();

    // If it is a select/dropdown, pick the first option
    const voiceSelect = page.locator('select[name="voice"]');
    if (await voiceSelect.isVisible()) {
      await voiceSelect.selectOption({ index: 1 });
    }

    // Submit form
    await page.locator('button[type="submit"], [data-testid="create-avatar-btn"]').click();

    // Verify success indication
    await expect(
      page.locator('text=/success|created|saved/i').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('admin can view personas', async ({ page }) => {
    await mockApiResponse(page, '**/api/personas*', {
      body: [
        { id: 'p-1', name: 'Angry Customer', description: 'An upset customer calling about a billing issue' },
        { id: 'p-2', name: 'New Hire', description: 'A confused new employee on their first day' },
      ],
    });

    await loginAsAdmin(page);
    await page.goto('/personas');

    // Verify personas list renders
    await expect(page.locator('text=Angry Customer')).toBeVisible();
    await expect(page.locator('text=New Hire')).toBeVisible();
  });

  test('admin can create scenario', async ({ page }) => {
    // Mock personas for the scenario form dropdown
    await mockApiResponse(page, '**/api/personas*', {
      body: [{ id: 'p-1', name: 'Angry Customer' }],
    });
    await mockApiResponse(page, '**/api/avatars*', {
      body: [{ id: 'av-1', name: 'Dr. Smith' }],
    });
    await mockApiResponse(page, '**/api/scenarios', {
      status: 201,
      body: { id: 'sc-new', title: 'Billing Complaint' },
    });

    await loginAsAdmin(page);
    await page.goto('/scenarios/create');

    // Fill scenario details (first tab)
    await page.locator('input[name="title"], [data-testid="scenario-title"]').fill('Billing Complaint');
    await page
      .locator('textarea[name="description"], [data-testid="scenario-description"]')
      .fill('Handle a billing complaint from an angry customer.');

    // Navigate to rubric tab if multi-tab form
    const rubricTab = page.locator('text=/rubric/i, [data-testid="rubric-tab"]').first();
    if (await rubricTab.isVisible()) {
      await rubricTab.click();

      // Add a rubric criterion
      const addCriterion = page.locator('button:has-text("Add"), [data-testid="add-criterion"]').first();
      if (await addCriterion.isVisible()) {
        await addCriterion.click();
        await page
          .locator('input[name*="criterion"], [data-testid="criterion-name"]')
          .first()
          .fill('Empathy');
      }
    }

    // Submit the scenario
    await page.locator('button[type="submit"], [data-testid="create-scenario-btn"]').click();

    await expect(
      page.locator('text=/success|created|saved/i').first(),
    ).toBeVisible({ timeout: 5_000 });
  });

  test('admin can view analytics dashboard', async ({ page }) => {
    await mockApiResponse(page, '**/api/analytics/overview*', {
      body: {
        totalSessions: 142,
        averageScore: 78,
        completionRate: 0.85,
        chartData: [
          { date: '2025-03-01', sessions: 12, avgScore: 75 },
          { date: '2025-03-02', sessions: 18, avgScore: 80 },
        ],
      },
    });

    await loginAsAdmin(page);
    await page.goto('/analytics');

    // Verify analytics overview renders with chart area
    await expect(page.locator('text=/142|total sessions/i').first()).toBeVisible();
    await expect(
      page.locator('.recharts-wrapper, canvas, [data-testid="analytics-chart"]').first(),
    ).toBeVisible();
  });

  test('admin can view scenario analytics', async ({ page }) => {
    await mockApiResponse(page, '**/api/analytics/scenarios/sc-1*', {
      body: {
        scenarioId: 'sc-1',
        title: 'Billing Complaint',
        totalAttempts: 56,
        averageScore: 82,
        rubricBreakdown: [
          { criterion: 'Empathy', avgScore: 88 },
          { criterion: 'Resolution', avgScore: 76 },
        ],
      },
    });

    await loginAsAdmin(page);
    await page.goto('/analytics/scenarios/sc-1');

    // Verify scenario-specific analytics
    await expect(page.locator('text=Billing Complaint')).toBeVisible();
    await expect(page.locator('text=/56|attempts/i').first()).toBeVisible();
  });
});
