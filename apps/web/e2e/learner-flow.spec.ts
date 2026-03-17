import { test, expect } from '@playwright/test';
import { loginAsLearner, mockApiResponse } from './helpers';

test.describe('Learner Flow', () => {
  test('learner can login and see dashboard', async ({ page }) => {
    await mockApiResponse(page, '**/api/assignments*', {
      body: [
        { id: 'asgn-1', scenarioTitle: 'Billing Complaint', dueDate: '2025-04-01', status: 'pending' },
        { id: 'asgn-2', scenarioTitle: 'Onboarding Call', dueDate: '2025-04-15', status: 'completed' },
      ],
    });

    await loginAsLearner(page);

    // Verify the learner dashboard shows assignments
    await expect(page.locator('text=Billing Complaint')).toBeVisible();
    await expect(page.locator('text=Onboarding Call')).toBeVisible();
  });

  test('learner can start preflight checks', async ({ page }) => {
    await mockApiResponse(page, '**/api/sessions*', {
      status: 201,
      body: { id: 'sess-1', scenarioId: 'sc-1', status: 'preflight' },
    });

    await loginAsLearner(page);
    await page.goto('/session/preflight');

    // Verify microphone and speaker check UI elements are present
    await expect(
      page.locator('text=/microphone|mic/i').first(),
    ).toBeVisible();
    await expect(
      page.locator('text=/speaker|audio/i').first(),
    ).toBeVisible();

    // Verify there is a button to proceed or test devices
    await expect(
      page.locator('button:has-text(/test|check|start|continue/i)').first(),
    ).toBeVisible();
  });

  test('learner can view session room', async ({ page }) => {
    await mockApiResponse(page, '**/api/sessions', {
      status: 201,
      body: {
        id: 'sess-1',
        scenarioId: 'sc-1',
        status: 'active',
        livekitToken: 'mock-livekit-token',
        livekitUrl: 'wss://mock.livekit.cloud',
      },
    });
    await mockApiResponse(page, '**/api/sessions/sess-1*', {
      body: {
        id: 'sess-1',
        scenarioId: 'sc-1',
        status: 'active',
      },
    });

    await loginAsLearner(page);
    await page.goto('/session/sess-1');

    // Verify video/avatar area and session controls are rendered
    await expect(
      page.locator('video, [data-testid="video-area"], [data-testid="avatar-display"]').first(),
    ).toBeVisible({ timeout: 10_000 });

    // Verify session controls (mute, end call, etc.)
    await expect(
      page.locator('button[aria-label*="mute"], button[aria-label*="end"], [data-testid="session-controls"]').first(),
    ).toBeVisible();
  });

  test('learner can view report', async ({ page }) => {
    await mockApiResponse(page, '**/api/reports/rpt-1*', {
      body: {
        id: 'rpt-1',
        sessionId: 'sess-1',
        scenarioTitle: 'Billing Complaint',
        overallScore: 85,
        rubricScores: [
          { criterion: 'Empathy', score: 90, feedback: 'Excellent empathy throughout.' },
          { criterion: 'Resolution', score: 80, feedback: 'Resolved the issue but could follow up.' },
        ],
        transcript: [
          { speaker: 'avatar', text: 'I am very upset about my bill.', timestamp: 0 },
          { speaker: 'learner', text: 'I understand your frustration. Let me look into this.', timestamp: 5 },
        ],
      },
    });

    await loginAsLearner(page);
    await page.goto('/reports/rpt-1');

    // Verify overall score is displayed
    await expect(page.locator('text=/85|overall/i').first()).toBeVisible();

    // Verify rubric breakdown
    await expect(page.locator('text=Empathy')).toBeVisible();
    await expect(page.locator('text=Resolution')).toBeVisible();

    // Verify transcript section
    await expect(
      page.locator('text=I understand your frustration').first(),
    ).toBeVisible();
  });
});
