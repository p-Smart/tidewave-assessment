import { test, expect } from '@playwright/test';
import { knownDefect, resetAll, settledMailCount, uid } from '../../fixtures';

test.describe('Public website — visitor journey', () => {
  test.beforeAll(async () => { await resetAll(); });

  test('visitor previews a track and opts in; exactly one intro email arrives', async ({ page, request }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Solace Avenue' }).first().click();
    await expect(page).toHaveURL(/\/artist\/solace-avenue/);

    // 30-second preview player
    const play = page.getByRole('button', { name: 'Play preview' });
    await play.click();
    await expect(page.getByRole('button', { name: 'Pause preview' })).toBeVisible();
    await expect(page.locator('[data-player] .time')).not.toHaveText(/^0:00 /, { timeout: 5000 });
    await page.getByRole('button', { name: 'Pause preview' }).click();
    await expect(page.getByRole('button', { name: 'Play preview' })).toBeVisible();

    // opt-in: the visitor makes an explicit consent choice
    const email = `listener.${uid()}@example.test`;
    await page.getByLabel('First name').fill('Listener');
    await page.getByLabel('Email').fill(email);
    await page.locator('input[name="consent"]').check();
    await page.getByRole('button', { name: 'Get updates' }).click();
    await expect(page).toHaveURL(/done=1/);
    await expect(page.getByText('Thanks. Check your inbox.')).toBeVisible();

    // engine -> n8n solace-events -> Mailpit
    expect(await settledMailCount(request, email, 1, 'Welcome to Solace Avenue')).toBe(1);
  });

  test('opt-in without a first name shows a validation message', async ({ page }) => {
    await page.goto('/artist/solace-avenue');
    await page.getByLabel('Email').fill(`nobody.${uid()}@example.test`);
    await page.getByRole('button', { name: 'Get updates' }).click();
    await expect(page.getByText('Please enter your first name and a valid email')).toBeVisible();
  });

  test('[TW-013] the marketing consent box on the artist page is unticked by default @defect', async ({ page }) => {
    knownDefect('TW-013', 'consent checkbox has the checked attribute');
    await page.goto('/artist/solace-avenue');
    await expect(page.locator('input[name="consent"]')).not.toBeChecked();
  });

  test('the campaign page shows the levels in each currency, rounded up (PR1/PR2)', async ({ page }) => {
    await page.goto('/campaigns/harmattan-sessions?currency=USD');
    await expect(page.getByText('$1.38')).toBeVisible();   // 2000 / 1452.50 = 1.3769 -> 1.38
    await page.goto('/campaigns/harmattan-sessions?currency=XOF');
    await expect(page.getByText('CFA 785')).toBeVisible(); // 2000 / 2.55 = 784.3 -> 785
  });
});
