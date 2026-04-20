const fs = require('fs');
const path = require('path');

function findPlaywrightPackage() {
  const npxRoot = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx');
  const candidates = fs
    .readdirSync(npxRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(npxRoot, entry.name, 'node_modules', 'playwright'))
    .filter((playwrightPath) => fs.existsSync(path.join(playwrightPath, 'package.json')))
    .map((playwrightPath) => ({
      playwrightPath,
      modifiedAt: fs.statSync(path.join(playwrightPath, 'package.json')).mtimeMs,
    }))
    .sort((left, right) => right.modifiedAt - left.modifiedAt);

  if (!candidates.length) {
    throw new Error('Could not locate a Playwright package in the npm cache.');
  }

  return candidates[0].playwrightPath;
}

async function expectVisible(page, text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: 'visible', timeout: 30000 });
  return locator;
}

async function main() {
  const playwrightPath = findPlaywrightPackage();
  const { chromium } = require(playwrightPath);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1100 } });
  const page = await context.newPage();

  await page.route('http://localhost:3000/api/**', async (route) => {
    const rewrittenUrl = route.request().url().replace('http://localhost:3000', 'http://192.168.1.5:3000');
    await route.continue({ url: rewrittenUrl });
  });

  const results = {
    reviewPage: {},
    knowledgeBasePage: {},
  };

  try {
    await page.goto('http://localhost:4200/test-generator/review', { waitUntil: 'networkidle', timeout: 60000 });
    await expectVisible(page, 'Generated Test Case Review');
    await expectVisible(page, 'Coverage analysis');
    await expectVisible(page, 'Learning Validation Draft A');
    await page.getByRole('button', { name: /Learning Validation Draft A/i }).click();
    await expectVisible(page, 'Missing requested features');
    await expectVisible(page, 'Risk Hotspots');
    await expectVisible(page, 'Missing requested features');
    await expectVisible(page, 'rejected');
    const reviewScreenshot = path.join(process.cwd(), 'artifacts', 'safe-learning-review-ui.png');
    await page.screenshot({ path: reviewScreenshot, fullPage: true });
    results.reviewPage = {
      status: 'ok',
      screenshot: reviewScreenshot,
    };

    await page.goto('http://localhost:4200/knowledge-base', { waitUntil: 'networkidle', timeout: 60000 });
    await expectVisible(page, 'Knowledge Base Workspace');
    await expectVisible(page, 'Learning suggestions');
    await expectVisible(page, 'Promote testcase: Verify that the Night Shift Escalation Ribbon');
    await page.getByText('Analytics Overview QA Memory', { exact: false }).click();
    await expectVisible(page, 'Project memory scope');
    await expectVisible(page, 'Safety Assistant');
    await expectVisible(page, 'Dashboard');
    await expectVisible(page, 'Analytics Overview');
    const kbScreenshot = path.join(process.cwd(), 'artifacts', 'safe-learning-knowledge-base-ui.png');
    await page.screenshot({ path: kbScreenshot, fullPage: true });
    results.knowledgeBasePage = {
      status: 'ok',
      screenshot: kbScreenshot,
    };
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
