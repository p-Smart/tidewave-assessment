import { test, expect, Page } from '@playwright/test';
import { URLS, mailCount, opsLogin, resetAll, settledMailCount, uid } from '../../fixtures';

const STAFF_INBOX = 'staff-test@tidewave.test';

async function openScreen(page: Page, role: 'Admin' | 'Viewer' = 'Viewer') {
  await opsLogin(page, role);
  await page.goto(`${URLS.ops}/messages/test`);
  await expect(page.getByRole('heading', { name: 'Test an email template' })).toBeVisible();
  await expect(page.getByLabel('Template')).toBeEnabled();
}

const previewBody = (page: Page) => page.frameLocator('[data-testid="preview-frame"]').locator('body');

test.describe('Ops console — Test an email template (/messages/test)', () => {
  test.beforeAll(async () => { await resetAll(); });

  test('lists only approved templates, never drafts', async ({ page }) => {
    await openScreen(page);
    const options = await page.getByLabel('Template').locator('option').allTextContents();
    expect(options).toEqual(
      expect.arrayContaining(['Solace Avenue Backing Confirmed', 'Solace Avenue Campaign Intro', 'Street Team Prospect Next Step'])
    );
    expect(options.join(' ')).not.toContain('Draft');
    expect(options).toHaveLength(3);
  });

  test('generates one input per template variable with label, required mark and example placeholder', async ({ page }) => {
    await openScreen(page);
    await page.getByLabel('Template').selectOption({ label: 'Street Team Prospect Next Step' });
    for (const [label, example, required] of [
      ['First Name', 'Kemi', true],
      ['Next Step Text', 'Please complete your screening interview booking.', true],
      ['Screening URL', 'http://localhost:7080/street-team/screening', true],
      ['Unsubscribe URL', 'mailto:hello@tidewave.test?subject=Unsubscribe', false],
    ] as const) {
      const input = page.getByLabel(label, { exact: false });
      await expect(input).toBeVisible();
      await expect(input).toHaveAttribute('placeholder', `e.g. ${example}`);
      await expect(input).toHaveAttribute('aria-required', String(required));
      const labelEl = page.locator(`label[for="${await input.getAttribute('id')}"]`);
      if (required) await expect(labelEl).toContainText('*');
      else await expect(labelEl).not.toContainText('*');
    }
    // switching template re-generates the fields
    await page.getByLabel('Template').selectOption({ label: 'Solace Avenue Campaign Intro' });
    await expect(page.getByLabel('Campaign URL', { exact: false })).toBeVisible();
    await expect(page.getByLabel('Next Step Text', { exact: false })).toHaveCount(0);
  });

  test('shows a live, sandboxed preview that follows what is typed', async ({ page }) => {
    await openScreen(page);
    await page.getByLabel('Template').selectOption({ label: 'Solace Avenue Campaign Intro' });
    const frame = page.getByTestId('preview-frame');
    await expect(frame).toHaveAttribute('sandbox', '');
    await expect(frame).toHaveAttribute('srcdoc', /<!DOCTYPE html>/i);
    await expect(previewBody(page)).toContainText('Hi there,'); // fallback while the name is empty
    await page.getByLabel('First Name', { exact: false }).fill('Ada');
    await expect(previewBody(page)).toContainText('Hi Ada,');
    await expect(page.getByTestId('preview-subject')).toHaveText('[TEST] Welcome to Solace Avenue');
    // variables are escaped, never interpreted
    await page.getByLabel('First Name', { exact: false }).fill('<b>Bold</b>');
    await expect(previewBody(page)).toContainText('Hi <b>Bold</b>,');
    await expect(previewBody(page).locator('b')).toHaveCount(0);
  });

  test('blocks sending until required fields are valid and explains why', async ({ page, request }) => {
    const before = await mailCount(request, STAFF_INBOX);
    await openScreen(page);
    await page.getByLabel('Template').selectOption({ label: 'Solace Avenue Campaign Intro' });
    await page.getByRole('button', { name: 'Send TEST run' }).click();
    await expect(page.getByTestId('send-result')).toContainText('fix the highlighted fields');
    await expect(page.getByText('First Name is required.')).toBeVisible();
    await expect(page.getByText('Campaign URL is required.')).toBeVisible();
    await page.getByLabel('Campaign URL', { exact: false }).fill('javascript:alert(1)');
    await expect(page.getByText('Campaign URL must start with http://, https:// or mailto:.')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await mailCount(request, STAFF_INBOX)).toBe(before);
  });

  test('sends one test email to the staff inbox and reports success; a double click does not send twice', async ({ page, request }) => {
    const before = await mailCount(request, STAFF_INBOX);
    await openScreen(page, 'Admin');
    await page.getByLabel('Template').selectOption({ label: 'Street Team Prospect Next Step' });
    await page.getByRole('button', { name: 'Fill with example values' }).click();
    const marker = `Playwright ${uid()}`;
    await page.getByLabel('First Name', { exact: false }).fill(marker);
    await expect(previewBody(page)).toContainText(`Hello ${marker},`);

    await page.getByRole('button', { name: 'Send TEST run' }).dblclick();
    const result = page.getByTestId('send-result');
    await expect(result).toContainText(`Test email sent to ${STAFF_INBOX}`, { timeout: 20_000 });
    await expect(result).toContainText('[TEST] Tidewave Street Team - Next Steps');
    await expect(result).toHaveClass(/alert-success/);

    expect(await settledMailCount(request, STAFF_INBOX, before + 1)).toBe(before + 1);
    const found = await request.get(`${URLS.mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${STAFF_INBOX}" "${marker}"`)}`);
    expect((await found.json()).messages_count).toBe(1);

    // sending the unchanged form again is refused as a duplicate, with a clear note
    await page.getByRole('button', { name: 'Send TEST run' }).click();
    await expect(result).toContainText('already sent');
    expect(await mailCount(request, STAFF_INBOX)).toBe(before + 1);
  });

  test('shows an unambiguous error when the automation service is down', async ({ page, context }) => {
    await openScreen(page);
    await page.getByLabel('Template').selectOption({ label: 'Solace Avenue Campaign Intro' });
    await page.getByRole('button', { name: 'Fill with example values' }).click();
    await context.route('**/api/messages/test-run', (route) =>
      route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'The automation service (n8n) is not reachable. Nothing was sent.' }) })
    );
    await page.getByRole('button', { name: 'Send TEST run' }).click();
    const result = page.getByTestId('send-result');
    await expect(result).toContainText('Not sent: The automation service (n8n) is not reachable');
    await expect(result).toHaveClass(/alert-error/);
  });
});
