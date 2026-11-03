# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ops/ops-console.spec.ts >> Ops console >> known defects >> [OPS-001] an Admin session cannot be obtained without credentials @defect
- Location: tests/ops/ops-console.spec.ts:95:9

# Error details

```
Error: expect(received).toContain(expected) // indexOf

Expected value: 404
Received array: [401, 403]
```

# Test source

```ts
  1   | import { test, expect, Page } from '@playwright/test';
  2   | import {
  3   |   CARDS, TOKENS, URLS, backViaApi, bearer, createLead, knownDefect, leadPayload, opsLogin, personaApi,
  4   |   resetAll, waitForEngineStatus,
  5   | } from '../../fixtures';
  6   | 
  7   | /** Sign in and check the navigation shows the role straight away (no reload, OPS-004 fixed). */
  8   | async function signIn(page: Page, role: 'Admin' | 'Viewer') {
  9   |   await opsLogin(page, role);
  10  |   await expect(page.getByLabel('Role indicator')).toHaveText(`Role: ${role}`);
  11  | }
  12  | 
  13  | test.describe('Ops console', () => {
  14  |   test.beforeAll(async () => { await resetAll(); });
  15  | 
  16  |   test.describe('Admin', () => {
  17  |     test('browses leads and sees payments with refund actions', async ({ page }) => {
  18  |       await signIn(page, 'Admin');
  19  |       await expect(page.getByRole('heading', { name: 'Street Team Leads' })).toBeVisible();
  20  |       const rows = page.locator('table.data-table tbody tr');
  21  |       await expect(rows.first()).toBeVisible();
  22  |       expect(await rows.count()).toBeGreaterThan(5);
  23  |       await expect(page.getByText(/Page 1 of \d+ \(\d+ total leads\)/)).toBeVisible();
  24  | 
  25  |       await page.getByRole('link', { name: 'Payments' }).click();
  26  |       await expect(page.getByRole('heading', { name: 'Backing Payments' })).toBeVisible();
  27  |       await expect(page.getByRole('button', { name: 'Refund' }).first()).toBeVisible();
  28  |     });
  29  | 
  30  |     test('[OPS-005] opening a lead shows its details and activity log @regression', async ({ page }) => {
  31  |       // Failed on the starter build (see evidence/playwright-strict-starter); fixed in ops-console.
  32  |       const errors: string[] = [];
  33  |       page.on('pageerror', (e) => errors.push(e.message));
  34  |       await signIn(page, 'Admin');
  35  |       await page.locator('table.data-table tbody tr').filter({ hasText: 'Tayo' }).first().click();
  36  |       await expect(page).toHaveURL(/\/leads\/lead_seed_1[34]/);
  37  |       await expect(page.getByRole('heading', { name: 'Tayo Adeleke' })).toBeVisible();
  38  |       await expect(page.getByText('tayo.adeleke@mail.test')).toBeVisible();
  39  |       await expect(page.getByRole('heading', { name: 'Activity Log' })).toBeVisible();
  40  |       await expect(page.getByRole('cell', { name: 'application_created' }).first()).toBeVisible();
  41  |       expect(errors, 'browser errors').toEqual([]);
  42  |     });
  43  | 
  44  |     test('double-clicking Refund sends a single refund request', async ({ page, request }) => {
  45  |       const bayo = await personaApi('bayo');
  46  |       const b = await backViaApi(bayo, '1000', CARDS.ok);
  47  |       await waitForEngineStatus(request, 'par_bayo_626179', b.paymentId, 'succeeded');
  48  | 
  49  |       await opsLogin(page, 'Admin');
  50  |       page.on('dialog', (d) => d.accept());
  51  |       const posts: string[] = [];
  52  |       page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/refunds')) posts.push(r.postData() ?? ''); });
  53  |       await page.goto(`${URLS.ops}/payments`);
  54  |       const row = page.locator('tr', { has: page.getByRole('button', { name: 'Refund' }) }).filter({ hasText: 'par_bayo_626179' }).first();
  55  |       await row.getByRole('button', { name: 'Refund' }).dblclick();
  56  |       await expect(page.getByText(/Refund processed for payment/)).toBeVisible();
  57  |       await page.waitForTimeout(1000);
  58  |       expect(posts, 'POST /api/refunds sent').toHaveLength(1);
  59  |     });
  60  |   });
  61  | 
  62  |   test.describe('Viewer', () => {
  63  |     test('can browse leads and payments but gets no refund action', async ({ page }) => {
  64  |       await signIn(page, 'Viewer');
  65  |       await page.getByRole('link', { name: 'Payments' }).click();
  66  |       await expect(page.getByRole('heading', { name: 'Backing Payments' })).toBeVisible();
  67  |       await expect(page.getByText('Admin only').first()).toBeVisible();
  68  |       await expect(page.getByRole('button', { name: 'Refund' })).toHaveCount(0);
  69  |     });
  70  | 
  71  |     test('cannot trigger a refund through the console API (403)', async ({ page }) => {
  72  |       await opsLogin(page, 'Viewer');
  73  |       const payments = await (await page.request.get(`${URLS.ops}/api/payments`)).json();
  74  |       const target = (Array.isArray(payments) ? payments : payments.items).find((p: any) => p.status === 'succeeded');
  75  |       const res = await page.request.post(`${URLS.ops}/api/refunds`, { data: { paymentId: target.id } });
  76  |       expect(res.status()).toBe(403);
  77  |     });
  78  | 
  79  |     test('is sent to the login page after signing out', async ({ page }) => {
  80  |       await signIn(page, 'Viewer');
  81  |       await page.getByRole('button', { name: 'Sign out' }).click();
  82  |       await expect(page).toHaveURL(/\/login/);
  83  |       await page.goto(`${URLS.ops}/leads`);
  84  |       await expect(page).toHaveURL(/\/login/);
  85  |     });
  86  |   });
  87  | 
  88  |   test.describe('known defects', () => {
  89  |     test('[OPS-004] after signing in, the navigation shows the role, links and Sign out without a reload @regression', async ({ page }) => {
  90  |       await opsLogin(page, 'Admin');
  91  |       await expect(page.getByLabel('Role indicator')).toHaveText('Role: Admin');
  92  |       await expect(page.getByRole('link', { name: 'Payments' })).toBeVisible();
  93  |     });
  94  | 
  95  |     test('[OPS-001] an Admin session cannot be obtained without credentials @defect', async ({ playwright }) => {
  96  |       knownDefect('OPS-001', 'role cookie is taken from the request body / plain cookie');
  97  |       const anon = await playwright.request.newContext({ baseURL: URLS.ops, extraHTTPHeaders: { Cookie: 'staff_role=Admin' } });
  98  |       const res = await anon.post('/api/refunds', { data: { paymentId: 'pay_does_not_exist' } });
> 99  |       expect([401, 403]).toContain(res.status()); // starter: 404 from the engine = request went through as admin
      |                          ^ Error: expect(received).toContain(expected) // indexOf
  100 |     });
  101 | 
  102 |     test('[OPS-002] searching finds leads that are not on the first page @regression', async ({ page, request }) => {
  103 |       // push the seed leads to page 2 with low-score applicants (not_now -> no emails)
  104 |       for (let i = 0; i < 21; i++) {
  105 |         await createLead(request, leadPayload({ firstName: `Filler${i}`, experienceYears: 0, hoursPerWeek: 0, city: 'Ibadan' }));
  106 |       }
  107 |       await opsLogin(page, 'Viewer');
  108 |       await expect(page.getByText(/Page 1 of [2-9]/)).toBeVisible(); // precondition: Kemi is no longer on page 1
  109 |       await page.getByPlaceholder('Search leads by name, email, or city...').fill('Kemi');
  110 |       await expect(page.locator('table.data-table tbody tr').filter({ hasText: 'Kemi' }).first(), 'seed lead Kemi Adeyemi').toBeVisible();
  111 |     });
  112 | 
  113 |     test('[OPS-003] XOF amounts are shown without dividing by 100 @regression', async ({ page }) => {
  114 |       await opsLogin(page, 'Viewer');
  115 |       await page.goto(`${URLS.ops}/payments`);
  116 |       const awa = page.locator('tr').filter({ hasText: 'par_awa_617761' }).first();
  117 |       await expect(awa).toContainText('6,500');
  118 |     });
  119 |   });
  120 | 
  121 |   test.afterAll(async () => { await resetAll(); });
  122 | });
  123 | 
```