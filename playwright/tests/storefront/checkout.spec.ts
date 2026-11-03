import { test, expect, Page } from '@playwright/test';
import { CARDS, TOKENS, bearer, knownDefect, loginAs, resetAll, settledMailCount, mailCount } from '../../fixtures';

const ADA = 'par_ada_616461';

async function reviewBacking(page: Page, amount: string, currency = 'NGN') {
  await page.goto('/checkout?campaign=harmattan-sessions');
  await page.getByLabel('Currency').selectOption(currency);
  await page.getByLabel(/^Amount/).fill(amount);
  await page.getByLabel('I understand backing is voluntary and is not an investment.').check();
  await page.getByRole('button', { name: 'Review backing' }).click();
}

async function payOnFakePay(page: Page, card: string) {
  await page.getByRole('button', { name: 'Pay with FakePay' }).click();
  await expect(page).toHaveURL(/localhost:7090\/pay\/fp_/);
  await page.locator('#card').fill(card);
  await page.locator('#exp').fill('12/30');
  await page.locator('#cvc').fill('123');
  await page.getByRole('button', { name: /^Pay / }).click();
  await page.waitForURL(/\/checkout\/return/);
}

test.describe('Public website — backing a campaign', () => {
  test.beforeAll(async () => { await resetAll(); });

  test('ada backs ₦2,000 with a quick pick, pays on FakePay and becomes a Listener', async ({ page, request }) => {
    const before = await mailCount(request, 'ada.obi@example.test', 'Confirmed');
    await loginAs(page, 'ada');
    await page.goto('/checkout?campaign=harmattan-sessions');
    await page.getByRole('button', { name: 'Become a Listener - ₦2,000.00' }).click();
    await expect(page.getByLabel(/^Amount/)).toHaveValue('2,000.00');
    await page.getByLabel('I understand backing is voluntary and is not an investment.').check();
    await page.getByRole('button', { name: 'Review backing' }).click();

    await expect(page.getByRole('heading', { name: 'Review your backing' })).toBeVisible();
    await expect(page.getByText('Fee (2.5%)')).toBeVisible();
    await expect(page.getByText('₦100.00')).toBeVisible();   // fee floor
    await expect(page.getByText('₦2,100.00')).toBeVisible(); // total to pay, fee separate
    await payOnFakePay(page, CARDS.ok);
    await expect(page.getByText("You're in!")).toBeVisible();

    await expect.poll(async () => {
      const ps = await (await request.get('/api/staff/participants', { headers: bearer(TOKENS.viewer) })).json();
      return ps.find((p: any) => p.id === ADA).campaigns[0].level;
    }).toBe('Listener');
    await page.goto('/me');
    await expect(page.getByText('Listener').first()).toBeVisible();
    expect(await settledMailCount(request, 'ada.obi@example.test', before + 1, 'Confirmed')).toBe(before + 1);
  });

  test('a declined card shows "Payment not completed" and nothing is counted', async ({ page }) => {
    await loginAs(page, 'ada');
    await reviewBacking(page, '1000');
    await payOnFakePay(page, CARDS.declined);
    await expect(page.getByText('Payment not completed')).toBeVisible();
    await expect(page.getByText('You have not been charged')).toBeVisible();
  });

  test('the server refuses a backing without the terms tick', async ({ page }) => {
    await loginAs(page, 'ada');
    await page.goto('/checkout?campaign=harmattan-sessions');
    await page.getByLabel(/^Amount/).fill('5000');
    await page.getByRole('button', { name: 'Review backing' }).click();
    await expect(page).toHaveURL(/\/checkout\?.*error=/);
    await expect(page.getByRole('alert')).toBeVisible();
  });

  test('[TW-017] an amount below the minimum explains the minimum instead of "Network problem" @defect', async ({ page }) => {
    knownDefect('TW-017', 'every checkout validation error is shown as a network problem');
    await loginAs(page, 'ada');
    await reviewBacking(page, '500');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('alert')).not.toContainText('Network problem');
    await expect(page.getByRole('alert')).toContainText(/1,000/);
  });

  test('[TW-011] a payment still processing at FakePay does not say "You\'re in" @defect', async ({ page }) => {
    knownDefect('TW-011', 'return page always shows the success message');
    await loginAs(page, 'ada');
    await reviewBacking(page, '1200');
    await payOnFakePay(page, CARDS.processing);
    await expect(page).toHaveURL(/status=processing/);
    await expect(page.getByText("You're in!")).not.toBeVisible();
  });

  test('double-clicking "Pay with FakePay" in the browser creates only one payment (double-submit)', async ({ page, request }) => {
    // The browser cancels the second form submission, so the UI is protected. The server itself is
    // not idempotent per quote — that is TW-016, proven in tests/api/engine.spec.ts.
    await loginAs(page, 'ada');
    await reviewBacking(page, '1300');
    const list = async () => (await (await request.get(`/api/staff/payments?participantId=${ADA}`, { headers: bearer(TOKENS.viewer) })).json()).map((p: any) => p.id);
    const before = new Set(await list());
    const posts: string[] = [];
    page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/checkout/pay')) posts.push(r.url()); });
    await page.getByRole('button', { name: 'Pay with FakePay' }).dblclick();
    await page.waitForURL(/localhost:7090\/pay\//);
    await page.waitForTimeout(1500);
    const created = (await list()).filter((id: string) => !before.has(id));
    test.info().annotations.push({ type: 'note', description: `browser sent ${posts.length} POST /checkout/pay` });
    expect(created).toHaveLength(1);
  });
});
