# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: storefront/visitor.spec.ts >> Public website — visitor journey >> [TW-013] the marketing consent box on the artist page is unticked by default @defect
- Location: tests/storefront/visitor.spec.ts:40:7

# Error details

```
Error: expect(locator).not.toBeChecked() failed

Locator:  locator('input[name="consent"]')
Expected: not checked
Received: checked
Timeout:  10000ms

Call log:
  - Expect "not toBeChecked" locator('input[name="consent"]') with timeout 10000ms
  - waiting for locator('input[name="consent"]')
    24 × locator resolved to <input checked value="yes" name="consent" type="checkbox"/>
       - unexpected value "checked"

```

```yaml
- checkbox [checked]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import { knownDefect, resetAll, settledMailCount, uid } from '../../fixtures';
  3  | 
  4  | test.describe('Public website — visitor journey', () => {
  5  |   test.beforeAll(async () => { await resetAll(); });
  6  | 
  7  |   test('visitor previews a track and opts in; exactly one intro email arrives', async ({ page, request }) => {
  8  |     await page.goto('/');
  9  |     await page.getByRole('link', { name: 'Solace Avenue' }).first().click();
  10 |     await expect(page).toHaveURL(/\/artist\/solace-avenue/);
  11 | 
  12 |     // 30-second preview player
  13 |     const play = page.getByRole('button', { name: 'Play preview' });
  14 |     await play.click();
  15 |     await expect(page.getByRole('button', { name: 'Pause preview' })).toBeVisible();
  16 |     await expect(page.locator('[data-player] .time')).not.toHaveText(/^0:00 /, { timeout: 5000 });
  17 |     await page.getByRole('button', { name: 'Pause preview' }).click();
  18 |     await expect(page.getByRole('button', { name: 'Play preview' })).toBeVisible();
  19 | 
  20 |     // opt-in: the visitor makes an explicit consent choice
  21 |     const email = `listener.${uid()}@example.test`;
  22 |     await page.getByLabel('First name').fill('Listener');
  23 |     await page.getByLabel('Email').fill(email);
  24 |     await page.locator('input[name="consent"]').check();
  25 |     await page.getByRole('button', { name: 'Get updates' }).click();
  26 |     await expect(page).toHaveURL(/done=1/);
  27 |     await expect(page.getByText('Thanks. Check your inbox.')).toBeVisible();
  28 | 
  29 |     // engine -> n8n solace-events -> Mailpit
  30 |     expect(await settledMailCount(request, email, 1, 'Welcome to Solace Avenue')).toBe(1);
  31 |   });
  32 | 
  33 |   test('opt-in without a first name shows a validation message', async ({ page }) => {
  34 |     await page.goto('/artist/solace-avenue');
  35 |     await page.getByLabel('Email').fill(`nobody.${uid()}@example.test`);
  36 |     await page.getByRole('button', { name: 'Get updates' }).click();
  37 |     await expect(page.getByText('Please enter your first name and a valid email')).toBeVisible();
  38 |   });
  39 | 
  40 |   test('[TW-013] the marketing consent box on the artist page is unticked by default @defect', async ({ page }) => {
  41 |     knownDefect('TW-013', 'consent checkbox has the checked attribute');
  42 |     await page.goto('/artist/solace-avenue');
> 43 |     await expect(page.locator('input[name="consent"]')).not.toBeChecked();
     |                                                             ^ Error: expect(locator).not.toBeChecked() failed
  44 |   });
  45 | 
  46 |   test('the campaign page shows the levels in each currency, rounded up (PR1/PR2)', async ({ page }) => {
  47 |     await page.goto('/campaigns/harmattan-sessions?currency=USD');
  48 |     await expect(page.getByText('$1.38')).toBeVisible();   // 2000 / 1452.50 = 1.3769 -> 1.38
  49 |     await page.goto('/campaigns/harmattan-sessions?currency=XOF');
  50 |     await expect(page.getByText('CFA 785')).toBeVisible(); // 2000 / 2.55 = 784.3 -> 785
  51 |   });
  52 | });
  53 | 
```