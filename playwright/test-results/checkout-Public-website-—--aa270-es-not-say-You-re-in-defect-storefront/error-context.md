# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: storefront/checkout.spec.ts >> Public website — backing a campaign >> [TW-011] a payment still processing at FakePay does not say "You're in" @defect
- Location: tests/storefront/checkout.spec.ts:78:7

# Error details

```
Error: expect(locator).not.toBeVisible() failed

Locator:  getByText('You\'re in!')
Expected: not visible
Received: visible
Timeout:  10000ms

Call log:
  - Expect "not toBeVisible" getByText('You\'re in!') with timeout 10000ms
  - waiting for getByText('You\'re in!')
    24 × locator resolved to <h1>You're in!</h1>
       - unexpected value "visible"

```

```yaml
- heading "You're in!" [level=1]
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | import { CARDS, TOKENS, bearer, knownDefect, loginAs, resetAll, settledMailCount, mailCount } from '../../fixtures';
  3   | 
  4   | const ADA = 'par_ada_616461';
  5   | 
  6   | async function reviewBacking(page: Page, amount: string, currency = 'NGN') {
  7   |   await page.goto('/checkout?campaign=harmattan-sessions');
  8   |   await page.getByLabel('Currency').selectOption(currency);
  9   |   await page.getByLabel(/^Amount/).fill(amount);
  10  |   await page.getByLabel('I understand backing is voluntary and is not an investment.').check();
  11  |   await page.getByRole('button', { name: 'Review backing' }).click();
  12  | }
  13  | 
  14  | async function payOnFakePay(page: Page, card: string) {
  15  |   await page.getByRole('button', { name: 'Pay with FakePay' }).click();
  16  |   await expect(page).toHaveURL(/localhost:7090\/pay\/fp_/);
  17  |   await page.locator('#card').fill(card);
  18  |   await page.locator('#exp').fill('12/30');
  19  |   await page.locator('#cvc').fill('123');
  20  |   await page.getByRole('button', { name: /^Pay / }).click();
  21  |   await page.waitForURL(/\/checkout\/return/);
  22  | }
  23  | 
  24  | test.describe('Public website — backing a campaign', () => {
  25  |   test.beforeAll(async () => { await resetAll(); });
  26  | 
  27  |   test('ada backs ₦2,000 with a quick pick, pays on FakePay and becomes a Listener', async ({ page, request }) => {
  28  |     const before = await mailCount(request, 'ada.obi@example.test', 'Confirmed');
  29  |     await loginAs(page, 'ada');
  30  |     await page.goto('/checkout?campaign=harmattan-sessions');
  31  |     await page.getByRole('button', { name: 'Become a Listener - ₦2,000.00' }).click();
  32  |     await expect(page.getByLabel(/^Amount/)).toHaveValue('2,000.00');
  33  |     await page.getByLabel('I understand backing is voluntary and is not an investment.').check();
  34  |     await page.getByRole('button', { name: 'Review backing' }).click();
  35  | 
  36  |     await expect(page.getByRole('heading', { name: 'Review your backing' })).toBeVisible();
  37  |     await expect(page.getByText('Fee (2.5%)')).toBeVisible();
  38  |     await expect(page.getByText('₦100.00')).toBeVisible();   // fee floor
  39  |     await expect(page.getByText('₦2,100.00')).toBeVisible(); // total to pay, fee separate
  40  |     await payOnFakePay(page, CARDS.ok);
  41  |     await expect(page.getByText("You're in!")).toBeVisible();
  42  | 
  43  |     await expect.poll(async () => {
  44  |       const ps = await (await request.get('/api/staff/participants', { headers: bearer(TOKENS.viewer) })).json();
  45  |       return ps.find((p: any) => p.id === ADA).campaigns[0].level;
  46  |     }).toBe('Listener');
  47  |     await page.goto('/me');
  48  |     await expect(page.getByText('Listener').first()).toBeVisible();
  49  |     expect(await settledMailCount(request, 'ada.obi@example.test', before + 1, 'Confirmed')).toBe(before + 1);
  50  |   });
  51  | 
  52  |   test('a declined card shows "Payment not completed" and nothing is counted', async ({ page }) => {
  53  |     await loginAs(page, 'ada');
  54  |     await reviewBacking(page, '1000');
  55  |     await payOnFakePay(page, CARDS.declined);
  56  |     await expect(page.getByText('Payment not completed')).toBeVisible();
  57  |     await expect(page.getByText('You have not been charged')).toBeVisible();
  58  |   });
  59  | 
  60  |   test('the server refuses a backing without the terms tick', async ({ page }) => {
  61  |     await loginAs(page, 'ada');
  62  |     await page.goto('/checkout?campaign=harmattan-sessions');
  63  |     await page.getByLabel(/^Amount/).fill('5000');
  64  |     await page.getByRole('button', { name: 'Review backing' }).click();
  65  |     await expect(page).toHaveURL(/\/checkout\?.*error=/);
  66  |     await expect(page.getByRole('alert')).toBeVisible();
  67  |   });
  68  | 
  69  |   test('[TW-017] an amount below the minimum explains the minimum instead of "Network problem" @defect', async ({ page }) => {
  70  |     knownDefect('TW-017', 'every checkout validation error is shown as a network problem');
  71  |     await loginAs(page, 'ada');
  72  |     await reviewBacking(page, '500');
  73  |     await expect(page.getByRole('alert')).toBeVisible();
  74  |     await expect(page.getByRole('alert')).not.toContainText('Network problem');
  75  |     await expect(page.getByRole('alert')).toContainText(/1,000/);
  76  |   });
  77  | 
  78  |   test('[TW-011] a payment still processing at FakePay does not say "You\'re in" @defect', async ({ page }) => {
  79  |     knownDefect('TW-011', 'return page always shows the success message');
  80  |     await loginAs(page, 'ada');
  81  |     await reviewBacking(page, '1200');
  82  |     await payOnFakePay(page, CARDS.processing);
  83  |     await expect(page).toHaveURL(/status=processing/);
> 84  |     await expect(page.getByText("You're in!")).not.toBeVisible();
      |                                                    ^ Error: expect(locator).not.toBeVisible() failed
  85  |   });
  86  | 
  87  |   test('double-clicking "Pay with FakePay" in the browser creates only one payment (double-submit)', async ({ page, request }) => {
  88  |     // The browser cancels the second form submission, so the UI is protected. The server itself is
  89  |     // not idempotent per quote — that is TW-016, proven in tests/api/engine.spec.ts.
  90  |     await loginAs(page, 'ada');
  91  |     await reviewBacking(page, '1300');
  92  |     const list = async () => (await (await request.get(`/api/staff/payments?participantId=${ADA}`, { headers: bearer(TOKENS.viewer) })).json()).map((p: any) => p.id);
  93  |     const before = new Set(await list());
  94  |     const posts: string[] = [];
  95  |     page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/checkout/pay')) posts.push(r.url()); });
  96  |     await page.getByRole('button', { name: 'Pay with FakePay' }).dblclick();
  97  |     await page.waitForURL(/localhost:7090\/pay\//);
  98  |     await page.waitForTimeout(1500);
  99  |     const created = (await list()).filter((id: string) => !before.has(id));
  100 |     test.info().annotations.push({ type: 'note', description: `browser sent ${posts.length} POST /checkout/pay` });
  101 |     expect(created).toHaveLength(1);
  102 |   });
  103 | });
  104 | 
```