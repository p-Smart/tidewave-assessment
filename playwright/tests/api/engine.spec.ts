import { test, expect, request as pwRequest } from '@playwright/test';
import {
  CARDS, PRODUCTION_EVENTS_URL, TOKENS, URLS, advanceEngineClock, backViaApi, bearer, confirmedTotal,
  fakepayAction, fakepayEventId, fakepayStatus, knownDefect, personaApi, resetAll, setEventsUrl,
  staffGet, uid, verifiedPayment, waitForEngineStatus, engineStatus,
} from '../../fixtures';

const PAR = { ada: 'par_ada_616461', kofi: 'par_kofi_6b6f66', musa: 'par_musa_6d7573', zara: 'par_zara_7a6172', bayo: 'par_bayo_626179' };

test.describe('Engine API', () => {
  test.beforeAll(async () => { await resetAll(); });

  test.describe('configuration', () => {
    test('[TW-015] after a reset the engine sends events to the production n8n webhook @defect', async ({ request }) => {
      knownDefect('TW-015', 'engine reset restores n8nEventsUrl to the /webhook-test/ URL');
      await fetch(`${URLS.engine}/__tools/reset`, { method: 'POST', headers: bearer(TOKENS.tools) });
      try {
        const settings = await staffGet(request, '/api/staff/settings');
        expect(settings.n8nEventsUrl).toBe(PRODUCTION_EVENTS_URL);
      } finally {
        await setEventsUrl(PRODUCTION_EVENTS_URL); // keep the rest of the suite working
      }
    });
  });

  test.describe('authorisation', () => {
    test('refund is refused for automation, anonymous and participant callers', async ({ request }) => {
      const [paid] = (await staffGet(request, '/api/staff/payments?status=succeeded'));
      for (const headers of [bearer(TOKENS.automation), {}]) {
        const res = await request.post('/api/staff/refunds', { headers, data: { paymentId: paid.id } });
        expect(res.status()).toBe(403);
      }
      const ada = await personaApi('ada');
      const res = await ada.post('/api/staff/refunds', { data: { paymentId: paid.id } });
      expect(res.status()).toBe(403);
    });

    test('settings can only be changed by an admin', async ({ request }) => {
      const res = await request.put('/api/staff/settings', { headers: bearer(TOKENS.viewer), data: { n8nEventsUrl: 'http://evil.test/' } });
      expect(res.status()).toBe(403);
    });

    test('[TW-005] a staff viewer cannot refund a payment @defect', async ({ request }) => {
      knownDefect('TW-005', 'POST /api/staff/refunds accepts the viewer token');
      const bayo = await personaApi('bayo');
      const b = await backViaApi(bayo, '1000', CARDS.ok);
      await waitForEngineStatus(request, PAR.bayo, b.paymentId, 'succeeded'); // refundable now
      const res = await request.post('/api/staff/refunds', { headers: bearer(TOKENS.viewer), data: { paymentId: b.paymentId } });
      expect(res.status()).toBe(403);
      expect(await fakepayStatus(request, b.fpRef)).toBe('succeeded');
    });
  });

  test.describe('validation', () => {
    test('quotes below the ₦1,000 instalment minimum are rejected (PR6)', async () => {
      const ada = await personaApi('ada');
      const res = await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'NGN', amount: '999.99', terms: 'yes' }, maxRedirects: 0 });
      expect(res.status()).toBe(303);
      expect(res.headers()['location']).toContain('error=');
    });

    test('the fee is 2.5% with a ₦100 minimum and is shown separately (PR5)', async () => {
      const ada = await personaApi('ada');
      const page = await (await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'NGN', amount: '1000', terms: 'yes' } })).text();
      expect(page).toContain('₦1,000.00');
      expect(page).toMatch(/Fee \(2\.5%\)[^₦]*₦100\.00/);
      expect(page).toMatch(/Total to pay[^₦]*₦1,100\.00/);
    });

    test('converted prices are rounded up (PR2) — USD minimum is $0.69, $0.68 is rejected', async () => {
      const ada = await personaApi('ada');
      const low = await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'USD', amount: '0.68', terms: 'yes' }, maxRedirects: 0 });
      expect(low.status()).toBe(303);
      const ok = await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'USD', amount: '0.69', terms: 'yes' }, maxRedirects: 0 });
      expect(ok.status()).toBe(200);
    });

    test('a forged FakePay webhook signature is rejected', async ({ request }) => {
      const body = JSON.stringify({ id: `fpevt_forged_${uid()}`, type: 'payment.succeeded', sequence: 2, data: {} });
      const res = await request.post('/webhooks/fakepay', {
        data: body, headers: { 'Content-Type': 'application/json', 'FakePay-Signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
      });
      expect(res.status()).toBe(400);
    });

    test('[TW-007] XOF backing counts at the full rate (XOF has no decimals) @defect', async () => {
      knownDefect('TW-007', 'XOF divided by 100 when converting to NGN');
      const ada = await personaApi('ada');
      const page = await (await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'XOF', amount: '3922', terms: 'yes' } })).text();
      expect(page).toContain('CFA 3,922');
      const countsAs = page.replace(/<[^>]+>/g, ' ').match(/Counts as\s+(₦[\d,.]+)/)?.[1];
      expect(countsAs, 'NGN value of CFA 3,922 at ₦2.55').toBe('₦10,001.10');
    });
  });

  test.describe('payment confirmation and webhooks', () => {
    test('a declined card is never credited', async ({ request }) => {
      const before = (await confirmedTotal(request, PAR.ada)).confirmedTotalMinor;
      const ada = await personaApi('ada');
      const b = await backViaApi(ada, '5000', CARDS.declined);
      await expect.poll(async () => (await verifiedPayment(request, b.paymentId)).status).toBe('failed');
      expect((await confirmedTotal(request, PAR.ada)).confirmedTotalMinor).toBe(before);
    });

    test('[TW-001] the return URL cannot confirm a payment that FakePay still holds @defect', async ({ request }) => {
      knownDefect('TW-001', 'GET /checkout/return?status=success credits a processing payment');
      const ada = await personaApi('ada');
      const before = (await confirmedTotal(request, PAR.ada)).confirmedTotalMinor;
      const b = await backViaApi(ada, '1500', CARDS.processing);
      await ada.get(`/checkout/return?payment=${b.paymentId}&status=success`);
      expect(await fakepayStatus(request, b.fpRef)).toBe('processing');
      expect((await confirmedTotal(request, PAR.ada)).confirmedTotalMinor).toBe(before);
    });

    test('[TW-002] replaying a payment.succeeded webhook credits the payment only once @defect', async ({ request }) => {
      knownDefect('TW-002', 'FakePay replays add a new ledger credit each time');
      const kofi = await personaApi('kofi');
      const before = (await confirmedTotal(request, PAR.kofi)).confirmedTotalMinor;
      const b = await backViaApi(kofi, '100', CARDS.ok, 'GHS'); // GHS 100 = ₦11,800
      await expect.poll(async () => (await confirmedTotal(request, PAR.kofi)).confirmedTotalMinor).toBe(before + 1_180_000);
      const ev = await fakepayEventId(request, b.fpRef, 'payment.succeeded');
      expect(ev).toBeTruthy();
      for (let i = 0; i < 2; i++) await fakepayAction(request, ev!, 'replay');
      await new Promise((r) => setTimeout(r, 3000));
      expect((await confirmedTotal(request, PAR.kofi)).confirmedTotalMinor).toBe(before + 1_180_000);
    });

    test('out-of-order processing event does not downgrade a succeeded payment', async ({ request }) => {
      const kofi = await personaApi('kofi');
      const b = await backViaApi(kofi, '10', CARDS.ok, 'GHS');
      await waitForEngineStatus(request, PAR.kofi, b.paymentId, 'succeeded');
      const ev = await fakepayEventId(request, b.fpRef, 'payment.processing');
      await fakepayAction(request, ev!, 'replay');
      await new Promise((r) => setTimeout(r, 2000));
      const row = (await staffGet(request, `/api/staff/payments?participantId=${PAR.kofi}`)).find((p: any) => p.id === b.paymentId);
      expect(row.status).toBe('succeeded');
    });

    test('[TW-003] a stale succeeded event cannot resurrect a refunded payment @defect', async ({ request }) => {
      knownDefect('TW-003', 'replayed payment.succeeded flips refunded back to succeeded and re-credits');
      const bayo = await personaApi('bayo');
      const b = await backViaApi(bayo, '2000', CARDS.ok);
      await waitForEngineStatus(request, PAR.bayo, b.paymentId, 'succeeded');
      const refund = await request.post('/api/staff/refunds', { headers: bearer(TOKENS.admin), data: { paymentId: b.paymentId } });
      expect(refund.ok()).toBeTruthy();
      await waitForEngineStatus(request, PAR.bayo, b.paymentId, 'refunded');
      const ev = await fakepayEventId(request, b.fpRef, 'payment.succeeded');
      await fakepayAction(request, ev!, 'replay');
      await new Promise((r) => setTimeout(r, 3000));
      expect(await fakepayStatus(request, b.fpRef)).toBe('refunded');
      expect(await engineStatus(request, PAR.bayo, b.paymentId)).toBe('refunded');
    });

    test('[TW-008] a refund removes the backing from the confirmed total (seed persona zara) @defect', async ({ request }) => {
      knownDefect('TW-008', 'confirmed total ignores ledger reversals');
      const payments = await staffGet(request, `/api/staff/payments?participantId=${PAR.zara}`);
      expect(payments.every((p: any) => p.status === 'refunded')).toBeTruthy();
      const total = await confirmedTotal(request, PAR.zara);
      expect(total.confirmedTotalMinor).toBe(0);
      expect(total.level).toBe('');
    });

    test('[TW-016] paying the same quote twice (double submit) charges only once @defect', async ({ request }) => {
      knownDefect('TW-016', 'each POST /checkout/pay creates a new payment and FakePay session for the same quote');
      const bayo = await personaApi('bayo');
      const q = await bayo.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'NGN', amount: '1000', terms: 'yes' } });
      const quoteId = (await q.text()).match(/quo_[0-9a-f]+/)![0];
      const [first, second] = await Promise.all([1, 2].map(() => bayo.post('/checkout/pay', { form: { quote: quoteId }, maxRedirects: 0 })));
      const sessions = new Set([first, second].map((r) => r.headers()['location']));
      expect(sessions.size, `FakePay sessions for one quote: ${[...sessions].join(', ')}`).toBe(1);
    });

    test('[TW-006] a payment confirmed after it expired is still credited (PR7) @defect', async ({ request }) => {
      knownDefect('TW-006', 'late payment.succeeded for an expired payment is ignored');
      const musa = await personaApi('musa');
      const before = (await confirmedTotal(request, PAR.musa)).confirmedTotalMinor;
      const b = await backViaApi(musa, '10000', CARDS.processing);
      await advanceEngineClock(request, 40);
      const ev = await fakepayEventId(request, b.fpRef, 'payment.succeeded');
      await fakepayAction(request, ev!, 'release');
      await expect.poll(() => fakepayStatus(request, b.fpRef)).toBe('succeeded');
      await expect.poll(async () => (await confirmedTotal(request, PAR.musa)).confirmedTotalMinor, { timeout: 8000 }).toBe(before + 1_000_000);
    });
  });

  test.describe('referrals', () => {
    test('[TW-010] referral credit is 5% of the backing, fee excluded (PR10) @defect', async ({ request }) => {
      knownDefect('TW-010', 'credit computed on backing + fee');
      const friend = await pwRequest.newContext({ baseURL: URLS.engine });
      const name = `friend${uid()}`;
      const join = await friend.post('/join', {
        form: { ref: 'MUSA-7Q', username: name, first_name: 'Friend', last_name: 'Test', email: `${name}@example.test`, currency: 'NGN', password: 'listen123' },
        maxRedirects: 0,
      });
      expect(join.headers()['location']).toBe('/me');
      const b = await backViaApi(friend, '10000', CARDS.ok);
      await expect.poll(async () => (await verifiedPayment(request, b.paymentId)).status).toBe('succeeded');
      await new Promise((r) => setTimeout(r, 3000)); // credit is written when the webhook lands
      const musa = await personaApi('musa');
      const page = await (await musa.get('/me/referrals')).text();
      const text = page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
      const credit = text.match(/Friend (₦[\d,.]+) held/)?.[1];
      expect(credit, 'credit for a ₦10,000 backing (fee ₦250)').toBe('₦500.00');
    });
  });

  test.afterAll(async () => { await resetAll(); }); // undo the clock move and refunds
});
