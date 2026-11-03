# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: storefront/persona.spec.ts >> Public website — persona account >> [TW-012] receipts show Lagos time (WAT) for a late-evening backing @defect
- Location: tests/storefront/persona.spec.ts:42:7

# Error details

```
Error: receipt #1003, stored 2026-10-29T23:20:00Z

expect(received).toBe(expected) // Object.is equality

Expected: "30 Oct 2026, 00:20"
Received: "29 Oct 2026, 23:20"
```

# Page snapshot

```yaml
- generic [active] [ref=f2e1]:
  - banner [ref=f2e2]:
    - generic [ref=f2e3]:
      - link "TidewaveMusic" [ref=f2e4] [cursor=pointer]:
        - /url: /
      - navigation [ref=f2e5]:
        - link "Solace Avenue" [ref=f2e6] [cursor=pointer]:
          - /url: /artist/solace-avenue
        - link "Harmattan Sessions" [ref=f2e7] [cursor=pointer]:
          - /url: /campaigns/harmattan-sessions
        - link "Street Team" [ref=f2e8] [cursor=pointer]:
          - /url: /street-team
        - link "Tunde" [ref=f2e9] [cursor=pointer]:
          - /url: /me
        - button "Sign out" [ref=f2e11] [cursor=pointer]
  - main [ref=f2e12]:
    - generic [ref=f2e13]:
      - paragraph [ref=f2e14]: "Receipt #1003"
      - heading "Harmattan Sessions" [level=1] [ref=f2e15]
      - table [ref=f2e16]:
        - rowgroup [ref=f2e17]:
          - row [ref=f2e18]:
            - rowheader "Backer" [ref=f2e19]
            - cell "Tunde Bakare tunde.bakare@example.test" [ref=f2e20]: Tunde Bakaretunde.bakare@example.test
          - row [ref=f2e21]:
            - rowheader "Date" [ref=f2e22]
            - cell "29 Oct 2026, 23:20" [ref=f2e23]
          - row [ref=f2e24]:
            - rowheader "Backing" [ref=f2e25]
            - cell "₦10,000.00" [ref=f2e26]
          - row [ref=f2e27]:
            - rowheader "Fee" [ref=f2e28]
            - cell "₦250.00" [ref=f2e29]
          - row [ref=f2e30]:
            - rowheader "Charged" [ref=f2e31]
            - cell "₦10,250.00" [ref=f2e32]
          - row [ref=f2e33]:
            - rowheader "Status" [ref=f2e34]
            - cell "succeeded" [ref=f2e35]
          - row [ref=f2e36]:
            - rowheader "Reference" [ref=f2e37]
            - cell [ref=f2e38]:
              - code [ref=f2e39]: pay_f7716f1940b754fedb
      - paragraph [ref=f2e40]: Tidewave Music · 12 Example Street, Lagos · hello@tidewave.test
  - contentinfo [ref=f2e41]:
    - generic [ref=f2e42]: Tidewave Music is a fictional company made for a test. Backing a campaign is voluntary. It is not employment and not an investment.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { TOKENS, bearer, knownDefect, lagosReceiptDate, loginAs, resetAll } from '../../fixtures';
  3  | 
  4  | test.describe('Public website — persona account', () => {
  5  |   test.beforeAll(async () => { await resetAll(); });
  6  | 
  7  |   test('persona logs in and sees the account page', async ({ page }) => {
  8  |     await loginAs(page, 'bayo');
  9  |     await expect(page.getByRole('heading', { name: 'Hello, Bayo' })).toBeVisible();
  10 |     await expect(page.getByText('Harmattan Sessions').first()).toBeVisible();
  11 |     await expect(page.getByText('Level:')).toBeVisible();
  12 |     await expect(page.getByText('Signed in as bayo')).toBeVisible();
  13 |     await page.getByRole('link', { name: 'My backing and receipts' }).click();
  14 |     await expect(page.getByRole('heading', { name: 'My backing' })).toBeVisible();
  15 |     await expect(page.getByRole('row').filter({ hasText: 'succeeded' })).toHaveCount(1);
  16 |   });
  17 | 
  18 |   test('wrong password is rejected with a message', async ({ page }) => {
  19 |     await page.goto('/login');
  20 |     await page.getByLabel('Username').fill('ada');
  21 |     await page.getByLabel('Password').fill('not-the-password');
  22 |     await page.getByRole('button', { name: 'Sign in' }).click();
  23 |     await expect(page).toHaveURL(/\/login/);
  24 |     await expect(page.getByText('Wrong username or password')).toBeVisible();
  25 |   });
  26 | 
  27 |   test('the account page requires a login', async ({ page }) => {
  28 |     await page.goto('/me');
  29 |     await expect(page).toHaveURL(/\/login\?next=/);
  30 |   });
  31 | 
  32 |   test('[TW-004] a participant cannot open another participant\'s receipt @defect', async ({ page, request }) => {
  33 |     knownDefect('TW-004', 'receipts are not checked for ownership');
  34 |     const payments = await (await request.get('/api/staff/payments', { headers: bearer(TOKENS.viewer) })).json();
  35 |     const someoneElse = payments.find((p: any) => p.participantId !== 'par_tunde_74756e' && p.receiptNo);
  36 |     await loginAs(page, 'tunde');
  37 |     const res = await page.goto(`/me/receipts/${someoneElse.receiptNo}`);
  38 |     expect(res?.status(), `receipt #${someoneElse.receiptNo} of ${someoneElse.participantId}`).not.toBe(200);
  39 |     await expect(page.getByText(/@example\.test/)).not.toBeVisible();
  40 |   });
  41 | 
  42 |   test('[TW-012] receipts show Lagos time (WAT) for a late-evening backing @defect', async ({ page, request }) => {
  43 |     knownDefect('TW-012', 'receipt formats the UTC time');
  44 |     const payments = await (await request.get('/api/staff/payments?participantId=par_tunde_74756e', { headers: bearer(TOKENS.viewer) })).json();
  45 |     const late = payments[0];
  46 |     const expected = lagosReceiptDate(late.createdAt); // 2026-10-29T23:20Z -> "30 Oct 2026, 00:20"
  47 |     await loginAs(page, 'tunde');
  48 |     await page.goto(`/me/receipts/${late.receiptNo}`);
  49 |     const shown = (await page.locator('body').innerText()).match(/Date\s+(\d{1,2} \w{3} \d{4}, \d{2}:\d{2})/)?.[1];
> 50 |     expect(shown, `receipt #${late.receiptNo}, stored ${late.createdAt}`).toBe(expected);
     |                                                                           ^ Error: receipt #1003, stored 2026-10-29T23:20:00Z
  51 |   });
  52 | });
  53 | 
```