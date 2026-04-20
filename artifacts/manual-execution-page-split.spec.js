const { test, expect } = require('@playwright/test');

const baseUrl = 'http://localhost:4200';
const apiBaseUrl = 'http://localhost:3000/api';

test('manual execution dashboard routes into the dedicated create page', async ({ page }) => {
  await page.goto(`${baseUrl}/manual-execution`, { waitUntil: 'networkidle' });

  await expect(page.getByRole('heading', { name: 'Manual Execution' })).toBeVisible();
  await expect(page.getByText('Execution hub')).toBeVisible();

  await page.getByRole('button', { name: 'Create Test Run' }).first().click();

  await expect(page).toHaveURL(/\/manual-execution\/create/);
  await expect(page.getByRole('heading', { name: 'Create Manual Test Run' })).toBeVisible();
  await expect(page.getByText('Choose approved suites or uploaded testcase documents')).toBeVisible();
});

test('execution page exposes the richer testcase detail view', async ({ page }) => {
  const runResponse = await fetch(`${apiBaseUrl}/manual-execution/runs?page=1&pageSize=20`);
  expect(runResponse.ok).toBeTruthy();
  const runPayload = await runResponse.json();
  const runId = runPayload.items?.[0]?.id;
  expect(runId).toBeTruthy();

  await page.goto(`${baseUrl}/manual-execution/runs/${runId}`, { waitUntil: 'networkidle' });

  await page.locator('.case-row__headline').first().click();

  await expect(page.getByText('Testcase profile')).toBeVisible();
  await expect(page.getByText('Source review status')).toBeVisible();
  await expect(page.getByText('Automation Candidate')).toBeVisible();
  await expect(page.getByText('Conditions and data')).toBeVisible();
  await expect(page.getByText('Steps and expected results')).toBeVisible();
});
