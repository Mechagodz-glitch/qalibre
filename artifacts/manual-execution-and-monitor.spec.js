import { test, expect } from '@playwright/test';

test.describe('manual execution and generation monitor regression checks', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.removeItem('qa-workbench-generation-runs');
    });
  });

  test('manual execution loads approved suites without serialization failure', async ({ page }) => {
    const approvedSuitesResponses = [];

    page.on('response', (response) => {
      if (response.url().includes('/api/manual-execution/approved-suites')) {
        approvedSuitesResponses.push(response.status());
      }
    });

    await page.goto('http://localhost:4200/manual-execution');
    await expect(page.getByText('Choose approved suites or uploaded testcase documents')).toBeVisible();

    await expect
      .poll(() => approvedSuitesResponses[approvedSuitesResponses.length - 1] ?? null, {
        timeout: 15000,
      })
      .toBe(200);
  });

  test('pending generation polling does not continue on unrelated pages without tracked runs', async ({ page }) => {
    let pendingRunsCallCount = 0;

    page.on('request', (request) => {
      if (request.url().includes('/api/test-generation/runs?page=1&pageSize=20&status=pending')) {
        pendingRunsCallCount += 1;
      }
    });

    await page.goto('http://localhost:4200/test-generator');
    await expect(page.getByText('Target infrastructure')).toBeVisible();

    pendingRunsCallCount = 0;

    await page.goto('http://localhost:4200/knowledge-base');
    await expect(page.getByRole('heading', { name: 'Knowledge Base Workspace' })).toBeVisible();
    await page.waitForTimeout(5500);

    expect(pendingRunsCallCount).toBe(0);
  });
});
