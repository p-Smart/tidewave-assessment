import { test, expect } from '@playwright/test';
import { TOKENS, bearer, knownDefect, lagosReceiptDate, loginAs, resetAll } from '../../fixtures';

test.describe('Public website — persona account', () => {
  test.beforeAll(async () => { await resetAll(); });

  test('persona logs in and sees the account page', async ({ page }) => {
    await loginAs(page, 'bayo');
    await expect(page.getByRole('heading', { name: 'Hello, Bayo' })).toBeVisible();
    await expect(page.getByText('Harmattan Sessions').first()).toBeVisible();
    await expect(page.getByText('Level:')).toBeVisible();
    await expect(page.getByText('Signed in as bayo')).toBeVisible();
    await page.getByRole('link', { name: 'My backing and receipts' }).click();
    await expect(page.getByRole('heading', { name: 'My backing' })).toBeVisible();
    await expect(page.getByRole('row').filter({ hasText: 'succeeded' })).toHaveCount(1);
  });

  test('wrong password is rejected with a message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill('ada');
    await page.getByLabel('Password').fill('not-the-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText('Wrong username or password')).toBeVisible();
  });

  test('the account page requires a login', async ({ page }) => {
    await page.goto('/me');
    await expect(page).toHaveURL(/\/login\?next=/);
  });

  test('[TW-004] a participant cannot open another participant\'s receipt @defect', async ({ page, request }) => {
    knownDefect('TW-004', 'receipts are not checked for ownership');
    const payments = await (await request.get('/api/staff/payments', { headers: bearer(TOKENS.viewer) })).json();
    const someoneElse = payments.find((p: any) => p.participantId !== 'par_tunde_74756e' && p.receiptNo);
    await loginAs(page, 'tunde');
    const res = await page.goto(`/me/receipts/${someoneElse.receiptNo}`);
    expect(res?.status(), `receipt #${someoneElse.receiptNo} of ${someoneElse.participantId}`).not.toBe(200);
    await expect(page.getByText(/@example\.test/)).not.toBeVisible();
  });

  test('[TW-012] receipts show Lagos time (WAT) for a late-evening backing @defect', async ({ page, request }) => {
    knownDefect('TW-012', 'receipt formats the UTC time');
    const payments = await (await request.get('/api/staff/payments?participantId=par_tunde_74756e', { headers: bearer(TOKENS.viewer) })).json();
    const late = payments[0];
    const expected = lagosReceiptDate(late.createdAt); // 2026-10-29T23:20Z -> "30 Oct 2026, 00:20"
    await loginAs(page, 'tunde');
    await page.goto(`/me/receipts/${late.receiptNo}`);
    const shown = (await page.locator('body').innerText()).match(/Date\s+(\d{1,2} \w{3} \d{4}, \d{2}:\d{2})/)?.[1];
    expect(shown, `receipt #${late.receiptNo}, stored ${late.createdAt}`).toBe(expected);
  });
});
