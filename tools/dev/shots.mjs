import { chromium } from '/home/psmart/BemaHub/tidewave-assessment/playwright/node_modules/playwright/index.mjs';
const OUT = '/home/psmart/BemaHub/tidewave-assessment/evidence/screenshots';
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();

// 1. Ops console test screen, filled, with preview
await page.goto('http://localhost:7300/login');
await page.getByRole('button', { name: 'Sign in as Admin' }).click();
await page.waitForURL('**/leads');
await page.goto('http://localhost:7300/messages/test');
await page.getByLabel('Template').selectOption({ label: 'Street Team Prospect Next Step' });
await page.getByRole('button', { name: 'Fill with example values' }).click();
await page.frameLocator('[data-testid="preview-frame"]').getByText('Hello Kemi,').waitFor();
await page.screenshot({ path: `${OUT}/ops-messages-test-filled.png`, fullPage: true });
// mobile preview of the rendered email at 375px
const mobile = await browser.newContext({ viewport: { width: 375, height: 812 } });
const mp = await mobile.newPage();
const html = await page.getByTestId('preview-frame').getAttribute('srcdoc');
await mp.setContent(html);
await mp.screenshot({ path: `${OUT}/email-street-team-prospect-375px.png`, fullPage: true });
const res = await fetch('http://localhost:7081/templates/solace-intro/render', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tw_staff_viewer_81d4e0' }, body: JSON.stringify({ variables: { firstName: 'Ada', campaignUrl: 'http://localhost:7080/campaigns/harmattan-sessions' } }) });
await mp.setContent((await res.json()).html);
await mp.screenshot({ path: `${OUT}/email-solace-intro-375px.png`, fullPage: true });

// 2. Mailpit inbox
await page.goto('http://localhost:7025/');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/mailpit-inbox.png`, fullPage: false });

// 3. n8n executions list and one solace-events execution
await page.goto('http://localhost:7678/signin');
await page.getByLabel(/email/i).fill('assessor@tidewave.test');
await page.getByLabel(/password/i).fill('Tidewave!2026');
await page.getByRole('button', { name: /sign in/i }).click();
await page.waitForURL(/\/(home|workflows)/, { timeout: 20000 }).catch(() => {});
await page.goto('http://localhost:7678/home/executions');
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/n8n-executions.png`, fullPage: false });
for (const id of ['wf_solace_events', 'wf_street_team_lead', 'wf_staff_test_run']) {
  await page.goto(`http://localhost:7678/workflow/${id}`);
  await page.waitForTimeout(5000);
  await page.keyboard.press('Shift+1').catch(() => {}); // "fit view"
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/n8n-${id}.png`, fullPage: false });
}
await browser.close();
console.log('done');
