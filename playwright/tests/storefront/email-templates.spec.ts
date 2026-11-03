import { test, expect, Page } from '@playwright/test';
import { TOKENS, URLS, bearer } from '../../fixtures';

/**
 * Section D: the two candidate templates (plus the confirmation email) rendered by the leads service
 * and checked against docs/EMAIL_BRIEFS.md on a 375px-wide phone viewport.
 */
const MOBILE = { width: 375, height: 812 };

type Rendered = { subject: string; html: string; text: string };
async function render(request: any, key: string, variables: Record<string, string>): Promise<Rendered> {
  const res = await request.post(`${URLS.leads}/templates/${key}/render`, { headers: bearer(TOKENS.viewer), data: { variables } });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function loadEmail(page: Page, html: string) {
  await page.setViewportSize(MOBILE);
  await page.setContent(html, { waitUntil: 'load' });
}

async function expectMobileFriendly(page: Page) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  expect(scrollWidth, 'no horizontal scrolling at 375px').toBeLessThanOrEqual(MOBILE.width);
  const fontSize = await page.locator('p').first().evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  expect(fontSize, 'body text at least 14px').toBeGreaterThanOrEqual(14);
  const cta = page.locator('.cta a');
  const box = await cta.boundingBox();
  expect(box, 'call-to-action button visible').not.toBeNull();
  expect(box!.height, 'tap target at least 44px high').toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width, 'button fits the screen').toBeLessThanOrEqual(MOBILE.width);
}

function expectNoForbiddenWords(text: string, words: RegExp) {
  const hits = text.match(words) ?? [];
  expect(hits, `forbidden wording: ${hits.join(', ')}`).toEqual([]);
}

test.describe('Email templates (Section D)', () => {
  test('street-team-prospect meets its brief at 375px', async ({ page, request }) => {
    const vars = { firstName: 'Kemi', nextStepText: 'Please book a 15-minute screening call.', screeningUrl: 'http://localhost:7080/street-team/screening' };
    const { subject, html, text } = await render(request, 'street-team-prospect', vars);
    await loadEmail(page, html);

    await expect(page.getByRole('heading', { name: 'Hello Kemi,' })).toBeVisible();
    await expect(page.getByText(vars.nextStepText)).toBeVisible();
    const cta = page.getByRole('link', { name: 'Book my screening call' });
    await expect(cta).toHaveAttribute('href', vars.screeningUrl);
    await expect(page.getByRole('link', { name: 'Unsubscribe' })).toHaveAttribute('href', /^(https?:\/\/|mailto:)/);
    await expect(page.getByText('not an offer of employment and not a binding engagement')).toBeVisible();
    expect(html, 'preheader for inbox previews').toMatch(/display:none[^>]*>\s*Kemi, your Street Team application/);
    await expectMobileFriendly(page);

    expectNoForbiddenWords(`${subject}\n${text}`, /\b(hired|active|active rep|field[ -]?ready|salary|wages|hiring|guarantee\w*)\b/gi);
    // "employment" may only appear in the disclaimer that negates it
    expect(text.match(/employment/g)).toHaveLength(1);
    expect(text).toContain('is not an offer of employment');
  });

  test('solace-intro meets its brief at 375px', async ({ page, request }) => {
    const vars = { firstName: 'Ada', campaignUrl: 'http://localhost:7080/campaigns/harmattan-sessions' };
    const { subject, html, text } = await render(request, 'solace-intro', vars);
    await loadEmail(page, html);

    await expect(page.getByRole('heading', { name: 'Hi Ada,' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'See the campaign' })).toHaveAttribute('href', vars.campaignUrl);
    await expect(page.getByRole('link', { name: 'Unsubscribe' })).toHaveAttribute('href', /^(https?:\/\/|mailto:)/);
    await expect(page.getByText('Backing is entirely voluntary.')).toBeVisible();
    await expect(page.getByText('not an investment, not a loan and not employment')).toBeVisible();
    expect(html).toMatch(/display:none[^>]*>\s*Solace Avenue are recording Harmattan Sessions/);
    await expectMobileFriendly(page);

    expectNoForbiddenWords(`${subject}\n${text}`,
      /\b(returns?|profit\w*|royalt\w*|equity|interest|dividend\w*|guaranteed?|hurry|last chance|only \d+ left|limited time|act now|don'?t miss)\b/gi);
  });

  test('templates fall back gracefully when variables are missing and never print "undefined"', async ({ page, request }) => {
    for (const key of ['street-team-prospect', 'solace-intro', 'solace-confirmed']) {
      const { html, text } = await render(request, key, {});
      expect(text, key).not.toContain('undefined');
      expect(text, key).toMatch(/^(Tidewave Music|Solace Avenue)/); // plain-text part starts with content, not CSS
      await loadEmail(page, html);
      await expect(page.getByRole('heading', { level: 1 }), key).toContainText(/(Hello|Hi|Thanks) there,/);
      await expect(page.locator('.cta a'), key).toHaveAttribute('href', /^http:\/\/localhost:7080\//);
    }
  });

  test('a javascript: link in a URL variable is dropped in favour of the safe default', async ({ request }) => {
    const { html } = await render(request, 'solace-intro', { firstName: 'Ada', campaignUrl: 'javascript:alert(1)' });
    expect(html).not.toContain('javascript:');
    expect(html).toContain('href="http://localhost:7080/campaigns/harmattan-sessions"');
  });
});
