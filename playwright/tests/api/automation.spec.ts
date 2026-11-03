import { test, expect } from '@playwright/test';
import {
  CARDS, TOKENS, URLS, backViaApi, bearer, fakepayAction, fakepayEventId, mailCount, personaApi,
  postSignedEvent, resetAll, settledMailCount, staffGet, uid, waitForEngineStatus,
} from '../../fixtures';

const STAFF_INBOX = 'staff-test@tidewave.test';
const testRun = (request: any, body: object) => request.post(`${URLS.n8n}/webhook/staff-test-run`, { data: body });
const introVars = { firstName: 'Ada', campaignUrl: 'http://localhost:7080/campaigns/harmattan-sessions' };

test.describe('n8n automation (Section B)', () => {
  test.beforeAll(async () => { await resetAll(); });

  test.describe('staff-test-run', () => {
    test('sends one [TEST] email to the staff inbox only, even if the payload asks for another recipient', async ({ request }) => {
      const before = await mailCount(request, STAFF_INBOX);
      const res = await testRun(request, {
        templateKey: 'solace-intro', variables: { ...introVars, email: 'someone@gmail.com' }, requestId: `req_${uid()}`,
      });
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ ok: true, outcome: 'sent', to: STAFF_INBOX });
      expect(body.subject).toMatch(/^\[TEST\] /);
      expect(await settledMailCount(request, STAFF_INBOX, before + 1)).toBe(before + 1);
      expect(await mailCount(request, 'someone@gmail.com')).toBe(0);
    });

    test('double submit with the same requestId sends a single email', async ({ request }) => {
      const before = await mailCount(request, STAFF_INBOX);
      const body = { templateKey: 'street-team-prospect', variables: { firstName: 'Kemi', nextStepText: 'Book a call.', screeningUrl: 'http://localhost:7080/street-team' }, requestId: `req_${uid()}` };
      const results = await Promise.all([testRun(request, body), testRun(request, body), testRun(request, body)]);
      expect(results.filter((r) => r.status() === 200 && true).length).toBeGreaterThanOrEqual(1);
      expect(await settledMailCount(request, STAFF_INBOX, before + 1)).toBe(before + 1);
    });

    test('draft templates are refused (422)', async ({ request }) => {
      const res = await testRun(request, { templateKey: 'old-promo-draft', variables: { firstName: 'Bayo' } });
      expect(res.status()).toBe(422);
      expect((await res.json()).error).toContain('draft');
    });

    test('missing required fields are refused (422) and listed', async ({ request }) => {
      const res = await testRun(request, { templateKey: 'solace-intro', variables: { firstName: 'Ada' } });
      expect(res.status()).toBe(422);
      expect((await res.json()).error).toContain('Campaign URL');
    });

    test('unknown or malformed template keys are refused', async ({ request }) => {
      expect((await testRun(request, { templateKey: 'nope', variables: {} })).status()).toBe(404);
      expect((await testRun(request, { templateKey: '../etc', variables: {} })).status()).toBe(400);
    });
  });

  test.describe('solace-events', () => {
    test('events with a missing or wrong signature are rejected (401)', async ({ request }) => {
      const unsigned = await request.post(`${URLS.n8n}/webhook/solace-events`, { data: { id: 'evt_x', type: 'payment.updated', data: {} } });
      expect(unsigned.status()).toBe(401);
      const wrong = await postSignedEvent(request, 'solace-events', { id: `evt_${uid()}`, type: 'payment.updated', data: {} }, 'not-the-secret');
      expect(wrong.status()).toBe(401);
    });

    test('a "succeeded" event for a payment FakePay declined sends no confirmation', async ({ request }) => {
      const dayoFailed = (await staffGet(request, '/api/staff/payments?status=failed'))[0];
      const res = await postSignedEvent(request, 'solace-events', {
        id: `evt_${uid()}`, type: 'payment.updated', data: { paymentId: dayoFailed.id, status: 'succeeded' },
      });
      expect(res.status()).toBe(200);
      expect(await res.json()).toMatchObject({ outcome: 'skipped' });
    });

    test('one real backing -> exactly one confirmation email, despite FakePay replays and an engine 503 burst', async ({ request }) => {
      const kofiEmail = 'kofi.mensah@example.test';
      const before = await mailCount(request, kofiEmail, 'Confirmed');
      // engine automation API fails twice: n8n must retry the payment verification
      await request.post(`${URLS.engine}/__tools/chaos`, { headers: bearer(TOKENS.tools), data: { target: 'automation-api', status: 503, count: 2 } });
      const kofi = await personaApi('kofi');
      const b = await backViaApi(kofi, '20', CARDS.ok, 'GHS');
      await waitForEngineStatus(request, 'par_kofi_6b6f66', b.paymentId, 'succeeded');
      expect(await settledMailCount(request, kofiEmail, before + 1, 'Confirmed')).toBe(before + 1);
      // FakePay replays make the engine emit the update again (and double-credit, TW-002) -> still one email
      const ev = await fakepayEventId(request, b.fpRef, 'payment.succeeded');
      await fakepayAction(request, ev!, 'replay');
      await fakepayAction(request, ev!, 'replay');
      await new Promise((r) => setTimeout(r, 4000));
      expect(await mailCount(request, kofiEmail, 'Confirmed')).toBe(before + 1);
    });

    test('a processing payment gets no confirmation email', async ({ request }) => {
      const awaEmail = 'awa.diallo@example.test';
      const before = await mailCount(request, awaEmail, 'Confirmed');
      const awa = await personaApi('awa');
      await backViaApi(awa, '1000', CARDS.processing, 'XOF');
      await new Promise((r) => setTimeout(r, 5000));
      expect(await mailCount(request, awaEmail, 'Confirmed')).toBe(before);
    });
  });

  test.afterAll(async () => { await resetAll(); });
});
