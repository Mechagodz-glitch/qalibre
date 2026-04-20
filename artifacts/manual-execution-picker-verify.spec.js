import { test, expect } from '@playwright/test';

test('manual execution approved suite picker shows cases and selected count updates', async ({ page }) => {
  let postedBody = null;

  await page.route('**/api/manual-execution/bootstrap', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        projectHierarchy: [
          {
            id: 'project-1',
            name: 'BP Whiting',
            description: null,
            modules: [
              {
                id: 'module-1',
                name: 'Safety Assistant',
                description: null,
                pages: [{ id: 'page-1', name: 'Home', description: null }],
              },
            ],
          },
        ],
        testerOptions: [{ id: 'tester-1', name: 'QA Tester', roleTitle: 'QA Analyst' }],
        summary: { approvedSuiteCount: 1, inProgressRunCount: 0, completedRunCount: 0 },
      }),
    });
  });

  await page.route('**/api/manual-execution/approved-suites**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            id: 'draft-1',
            runId: 'run-1',
            title: 'BP Whiting - Home Validation',
            summary: 'Approved suite for manual execution',
            version: 4,
            caseCount: 3,
            approvedAt: '2026-04-04T10:00:00.000Z',
            approvedBy: 'qa.engine',
            suiteContext: {
              project: { id: 'project-1', name: 'BP Whiting' },
              module: { id: 'module-1', name: 'Safety Assistant' },
              page: { id: 'page-1', name: 'Home' },
              path: 'BP Whiting > Safety Assistant > Home',
            },
            cases: [
              {
                sourceCaseId: 'PBF-HOME-001',
                title: 'Verify date range filter updates the dashboard cards',
                feature: 'Date Range',
                scenario: 'Header filters',
                testType: 'Functional',
                priority: 'High',
                severity: 'Medium',
                notes: null,
              },
              {
                sourceCaseId: 'PBF-HOME-002',
                title: 'Verify unit dropdown syncs widget data after selection change',
                feature: 'Unit Dropdown',
                scenario: 'Header filters',
                testType: 'Functional',
                priority: 'High',
                severity: 'Medium',
                notes: null,
              },
              {
                sourceCaseId: 'PBF-HOME-003',
                title: 'Verify KPI cards keep their layout on 4K TV viewport',
                feature: 'Responsiveness',
                scenario: 'Viewport checks',
                testType: 'Usability',
                priority: 'Medium',
                severity: 'Low',
                notes: null,
              },
            ],
          },
        ],
      }),
    });
  });

  await page.route('**/api/manual-execution/runs?page=1&pageSize=20&projectId=project-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0, totalPages: 1 }),
    });
  });

  await page.route('**/api/manual-execution/runs', async (route) => {
    if (route.request().method() === 'POST') {
      postedBody = JSON.parse(route.request().postData() || '{}');
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          run: {
            id: 'manual-run-1',
            name: postedBody.name,
            status: 'draft',
            project: { id: 'project-1', name: 'BP Whiting' },
            module: { id: 'module-1', name: 'Safety Assistant' },
            page: { id: 'page-1', name: 'Home' },
            environment: null,
            buildVersion: null,
            assignedTester: null,
            notes: null,
            createdBy: 'qa.engine',
            createdAt: '2026-04-04T11:00:00.000Z',
            updatedAt: '2026-04-04T11:00:00.000Z',
            completedAt: null,
            completedBy: null,
            suiteCount: 1,
            totals: { total: 2, untested: 2, passed: 0, failed: 0, skipped: 0, completionPercent: 0 },
          },
        }),
      });
      return;
    }

    await route.fallback();
  });

  await page.route('**/api/manual-execution/runs/manual-run-1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        run: {
          id: 'manual-run-1',
          name: 'Focused Home Run',
          status: 'draft',
          project: { id: 'project-1', name: 'BP Whiting' },
          module: { id: 'module-1', name: 'Safety Assistant' },
          page: { id: 'page-1', name: 'Home' },
          environment: null,
          buildVersion: null,
          assignedTester: null,
          notes: null,
          createdBy: 'qa.engine',
          createdAt: '2026-04-04T11:00:00.000Z',
          updatedAt: '2026-04-04T11:00:00.000Z',
          completedAt: null,
          completedBy: null,
          suiteCount: 1,
          totals: { total: 2, untested: 2, passed: 0, failed: 0, skipped: 0, completionPercent: 0 },
          suites: [],
          caseResults: [],
          report: {
            summary: { total: 2, untested: 2, passed: 0, failed: 0, skipped: 0, completionPercent: 0 },
            charts: { statusDistribution: [], bySuite: [], failuresByFeature: [], failuresBySeverity: [] },
            selectedSuites: [],
            detailedResults: [],
          },
        },
      }),
    });
  });

  await page.goto('http://localhost:4200/manual-execution');
  await expect(page.getByText('Choose approved suites or uploaded testcase documents')).toBeVisible();

  await page.getByRole('button', { name: 'Choose testcases' }).first().click();

  await expect(page.getByText('Approved testcases')).toBeVisible();
  await expect(page.getByText('Verify date range filter updates the dashboard cards')).toBeVisible();
  await expect(page.getByText('Verify unit dropdown syncs widget data after selection change')).toBeVisible();
  await expect(page.getByText('Verify KPI cards keep their layout on 4K TV viewport')).toBeVisible();

  await expect(page.getByText('0 / 3 selected').first()).toBeVisible();
  await expect(page.getByText('0 cases').first()).toBeVisible();

  const caseCheckboxes = page.locator('.suite-case-list .mat-mdc-checkbox input[type="checkbox"]');
  await caseCheckboxes.nth(0).check();
  await caseCheckboxes.nth(1).check();

  await expect(page.getByText('2 / 3 selected').first()).toBeVisible();
  await expect(page.getByText('2 cases').first()).toBeVisible();

  await page.getByLabel('Test Run Name').fill('Focused Home Run');
  await page.getByRole('button', { name: 'Create Test Run' }).click();

  await expect.poll(() => postedBody).not.toBeNull();
  expect(postedBody.suiteSelections).toHaveLength(1);
  expect(postedBody.suiteSelections[0].suiteId).toBe('draft-1');
  expect(postedBody.suiteSelections[0].caseIds).toEqual(['PBF-HOME-001', 'PBF-HOME-002']);

  await page.screenshot({ path: 'artifacts/manual-execution-picker-verified.png', fullPage: true });
});
