import { test, expect, Page } from '@playwright/test';
import {
  CARDS, TOKENS, URLS, backViaApi, bearer, createLead, knownDefect, leadPayload, opsLogin, personaApi,
  resetAll, waitForEngineStatus,
} from '../../fixtures';

/** Sign in and check the navigation shows the role straight away (no reload, OPS-004 fixed). */
async function signIn(page: Page, role: 'Admin' | 'Viewer') {
  await opsLogin(page, role);
  await expect(page.getByLabel('Role indicator')).toHaveText(`Role: ${role}`);
}

test.describe('Ops console', () => {
  test.beforeAll(async () => { await resetAll(); });

  test.describe('Admin', () => {
    test('browses leads and sees payments with refund actions', async ({ page }) => {
      await signIn(page, 'Admin');
      await expect(page.getByRole('heading', { name: 'Street Team Leads' })).toBeVisible();
      const rows = page.locator('table.data-table tbody tr');
      await expect(rows.first()).toBeVisible();
      expect(await rows.count()).toBeGreaterThan(5);
      await expect(page.getByText(/Page 1 of \d+ \(\d+ total leads\)/)).toBeVisible();

      await page.getByRole('link', { name: 'Payments' }).click();
      await expect(page.getByRole('heading', { name: 'Backing Payments' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refund' }).first()).toBeVisible();
    });

    test('[OPS-005] opening a lead shows its details and activity log @regression', async ({ page }) => {
      // Failed on the starter build (see evidence/playwright-strict-starter); fixed in ops-console.
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await signIn(page, 'Admin');
      await page.locator('table.data-table tbody tr').filter({ hasText: 'Tayo' }).first().click();
      await expect(page).toHaveURL(/\/leads\/lead_seed_1[34]/);
      await expect(page.getByRole('heading', { name: 'Tayo Adeleke' })).toBeVisible();
      await expect(page.getByText('tayo.adeleke@mail.test')).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Activity Log' })).toBeVisible();
      await expect(page.getByRole('cell', { name: 'application_created' }).first()).toBeVisible();
      expect(errors, 'browser errors').toEqual([]);
    });

    test('double-clicking Refund sends a single refund request', async ({ page, request }) => {
      const bayo = await personaApi('bayo');
      const b = await backViaApi(bayo, '1000', CARDS.ok);
      await waitForEngineStatus(request, 'par_bayo_626179', b.paymentId, 'succeeded');

      await opsLogin(page, 'Admin');
      page.on('dialog', (d) => d.accept());
      const posts: string[] = [];
      page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/api/refunds')) posts.push(r.postData() ?? ''); });
      await page.goto(`${URLS.ops}/payments`);
      const row = page.locator('tr', { has: page.getByRole('button', { name: 'Refund' }) }).filter({ hasText: 'par_bayo_626179' }).first();
      await row.getByRole('button', { name: 'Refund' }).dblclick();
      await expect(page.getByText(/Refund processed for payment/)).toBeVisible();
      await page.waitForTimeout(1000);
      expect(posts, 'POST /api/refunds sent').toHaveLength(1);
    });
  });

  test.describe('Viewer', () => {
    test('can browse leads and payments but gets no refund action', async ({ page }) => {
      await signIn(page, 'Viewer');
      await page.getByRole('link', { name: 'Payments' }).click();
      await expect(page.getByRole('heading', { name: 'Backing Payments' })).toBeVisible();
      await expect(page.getByText('Admin only').first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Refund' })).toHaveCount(0);
    });

    test('cannot trigger a refund through the console API (403)', async ({ page }) => {
      await opsLogin(page, 'Viewer');
      const payments = await (await page.request.get(`${URLS.ops}/api/payments`)).json();
      const target = (Array.isArray(payments) ? payments : payments.items).find((p: any) => p.status === 'succeeded');
      const res = await page.request.post(`${URLS.ops}/api/refunds`, { data: { paymentId: target.id } });
      expect(res.status()).toBe(403);
    });

    test('is sent to the login page after signing out', async ({ page }) => {
      await signIn(page, 'Viewer');
      await page.getByRole('button', { name: 'Sign out' }).click();
      await expect(page).toHaveURL(/\/login/);
      await page.goto(`${URLS.ops}/leads`);
      await expect(page).toHaveURL(/\/login/);
    });
  });

  test.describe('known defects', () => {
    test('[OPS-004] after signing in, the navigation shows the role, links and Sign out without a reload @regression', async ({ page }) => {
      await opsLogin(page, 'Admin');
      await expect(page.getByLabel('Role indicator')).toHaveText('Role: Admin');
      await expect(page.getByRole('link', { name: 'Payments' })).toBeVisible();
    });

    test('[OPS-001] an Admin session cannot be obtained without credentials @defect', async ({ playwright }) => {
      knownDefect('OPS-001', 'role cookie is taken from the request body / plain cookie');
      const anon = await playwright.request.newContext({ baseURL: URLS.ops, extraHTTPHeaders: { Cookie: 'staff_role=Admin' } });
      const res = await anon.post('/api/refunds', { data: { paymentId: 'pay_does_not_exist' } });
      expect([401, 403]).toContain(res.status()); // starter: 404 from the engine = request went through as admin
    });

    test('[OPS-002] searching finds leads that are not on the first page @regression', async ({ page, request }) => {
      // push the seed leads to page 2 with low-score applicants (not_now -> no emails)
      for (let i = 0; i < 21; i++) {
        await createLead(request, leadPayload({ firstName: `Filler${i}`, experienceYears: 0, hoursPerWeek: 0, city: 'Ibadan' }));
      }
      await opsLogin(page, 'Viewer');
      await expect(page.getByText(/Page 1 of [2-9]/)).toBeVisible(); // precondition: Kemi is no longer on page 1
      await page.getByPlaceholder('Search leads by name, email, or city...').fill('Kemi');
      await expect(page.locator('table.data-table tbody tr').filter({ hasText: 'Kemi' }).first(), 'seed lead Kemi Adeyemi').toBeVisible();
    });

    test('[OPS-003] XOF amounts are shown without dividing by 100 @regression', async ({ page }) => {
      await opsLogin(page, 'Viewer');
      await page.goto(`${URLS.ops}/payments`);
      const awa = page.locator('tr').filter({ hasText: 'par_awa_617761' }).first();
      await expect(awa).toContainText('6,500');
    });
  });

  test.afterAll(async () => { await resetAll(); });
});
