# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api/engine.spec.ts >> Engine API >> validation >> [TW-007] XOF backing counts at the full rate (XOF has no decimals) @defect
- Location: tests/api/engine.spec.ts:86:9

# Error details

```
Error: NGN value of CFA 3,922 at ₦2.55

expect(received).toBe(expected) // Object.is equality

Expected: "₦10,001.10"
Received: "₦100.01"
```

# Test source

```ts
  1   | import { test, expect, request as pwRequest } from '@playwright/test';
  2   | import {
  3   |   CARDS, PRODUCTION_EVENTS_URL, TOKENS, URLS, advanceEngineClock, backViaApi, bearer, confirmedTotal,
  4   |   fakepayAction, fakepayEventId, fakepayStatus, knownDefect, personaApi, resetAll, setEventsUrl,
  5   |   staffGet, uid, verifiedPayment, waitForEngineStatus, engineStatus,
  6   | } from '../../fixtures';
  7   | 
  8   | const PAR = { ada: 'par_ada_616461', kofi: 'par_kofi_6b6f66', musa: 'par_musa_6d7573', zara: 'par_zara_7a6172', bayo: 'par_bayo_626179' };
  9   | 
  10  | test.describe('Engine API', () => {
  11  |   test.beforeAll(async () => { await resetAll(); });
  12  | 
  13  |   test.describe('configuration', () => {
  14  |     test('[TW-015] after a reset the engine sends events to the production n8n webhook @defect', async ({ request }) => {
  15  |       knownDefect('TW-015', 'engine reset restores n8nEventsUrl to the /webhook-test/ URL');
  16  |       await fetch(`${URLS.engine}/__tools/reset`, { method: 'POST', headers: bearer(TOKENS.tools) });
  17  |       try {
  18  |         const settings = await staffGet(request, '/api/staff/settings');
  19  |         expect(settings.n8nEventsUrl).toBe(PRODUCTION_EVENTS_URL);
  20  |       } finally {
  21  |         await setEventsUrl(PRODUCTION_EVENTS_URL); // keep the rest of the suite working
  22  |       }
  23  |     });
  24  |   });
  25  | 
  26  |   test.describe('authorisation', () => {
  27  |     test('refund is refused for automation, anonymous and participant callers', async ({ request }) => {
  28  |       const [paid] = (await staffGet(request, '/api/staff/payments?status=succeeded'));
  29  |       for (const headers of [bearer(TOKENS.automation), {}]) {
  30  |         const res = await request.post('/api/staff/refunds', { headers, data: { paymentId: paid.id } });
  31  |         expect(res.status()).toBe(403);
  32  |       }
  33  |       const ada = await personaApi('ada');
  34  |       const res = await ada.post('/api/staff/refunds', { data: { paymentId: paid.id } });
  35  |       expect(res.status()).toBe(403);
  36  |     });
  37  | 
  38  |     test('settings can only be changed by an admin', async ({ request }) => {
  39  |       const res = await request.put('/api/staff/settings', { headers: bearer(TOKENS.viewer), data: { n8nEventsUrl: 'http://evil.test/' } });
  40  |       expect(res.status()).toBe(403);
  41  |     });
  42  | 
  43  |     test('[TW-005] a staff viewer cannot refund a payment @defect', async ({ request }) => {
  44  |       knownDefect('TW-005', 'POST /api/staff/refunds accepts the viewer token');
  45  |       const bayo = await personaApi('bayo');
  46  |       const b = await backViaApi(bayo, '1000', CARDS.ok);
  47  |       await waitForEngineStatus(request, PAR.bayo, b.paymentId, 'succeeded'); // refundable now
  48  |       const res = await request.post('/api/staff/refunds', { headers: bearer(TOKENS.viewer), data: { paymentId: b.paymentId } });
  49  |       expect(res.status()).toBe(403);
  50  |       expect(await fakepayStatus(request, b.fpRef)).toBe('succeeded');
  51  |     });
  52  |   });
  53  | 
  54  |   test.describe('validation', () => {
  55  |     test('quotes below the ₦1,000 instalment minimum are rejected (PR6)', async () => {
  56  |       const ada = await personaApi('ada');
  57  |       const res = await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'NGN', amount: '999.99', terms: 'yes' }, maxRedirects: 0 });
  58  |       expect(res.status()).toBe(303);
  59  |       expect(res.headers()['location']).toContain('error=');
  60  |     });
  61  | 
  62  |     test('the fee is 2.5% with a ₦100 minimum and is shown separately (PR5)', async () => {
  63  |       const ada = await personaApi('ada');
  64  |       const page = await (await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'NGN', amount: '1000', terms: 'yes' } })).text();
  65  |       expect(page).toContain('₦1,000.00');
  66  |       expect(page).toMatch(/Fee \(2\.5%\)[^₦]*₦100\.00/);
  67  |       expect(page).toMatch(/Total to pay[^₦]*₦1,100\.00/);
  68  |     });
  69  | 
  70  |     test('converted prices are rounded up (PR2) — USD minimum is $0.69, $0.68 is rejected', async () => {
  71  |       const ada = await personaApi('ada');
  72  |       const low = await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'USD', amount: '0.68', terms: 'yes' }, maxRedirects: 0 });
  73  |       expect(low.status()).toBe(303);
  74  |       const ok = await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'USD', amount: '0.69', terms: 'yes' }, maxRedirects: 0 });
  75  |       expect(ok.status()).toBe(200);
  76  |     });
  77  | 
  78  |     test('a forged FakePay webhook signature is rejected', async ({ request }) => {
  79  |       const body = JSON.stringify({ id: `fpevt_forged_${uid()}`, type: 'payment.succeeded', sequence: 2, data: {} });
  80  |       const res = await request.post('/webhooks/fakepay', {
  81  |         data: body, headers: { 'Content-Type': 'application/json', 'FakePay-Signature': `t=${Math.floor(Date.now() / 1000)},v1=${'0'.repeat(64)}` },
  82  |       });
  83  |       expect(res.status()).toBe(400);
  84  |     });
  85  | 
  86  |     test('[TW-007] XOF backing counts at the full rate (XOF has no decimals) @defect', async () => {
  87  |       knownDefect('TW-007', 'XOF divided by 100 when converting to NGN');
  88  |       const ada = await personaApi('ada');
  89  |       const page = await (await ada.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'XOF', amount: '3922', terms: 'yes' } })).text();
  90  |       expect(page).toContain('CFA 3,922');
  91  |       const countsAs = page.replace(/<[^>]+>/g, ' ').match(/Counts as\s+(₦[\d,.]+)/)?.[1];
> 92  |       expect(countsAs, 'NGN value of CFA 3,922 at ₦2.55').toBe('₦10,001.10');
      |                                                           ^ Error: NGN value of CFA 3,922 at ₦2.55
  93  |     });
  94  |   });
  95  | 
  96  |   test.describe('payment confirmation and webhooks', () => {
  97  |     test('a declined card is never credited', async ({ request }) => {
  98  |       const before = (await confirmedTotal(request, PAR.ada)).confirmedTotalMinor;
  99  |       const ada = await personaApi('ada');
  100 |       const b = await backViaApi(ada, '5000', CARDS.declined);
  101 |       await expect.poll(async () => (await verifiedPayment(request, b.paymentId)).status).toBe('failed');
  102 |       expect((await confirmedTotal(request, PAR.ada)).confirmedTotalMinor).toBe(before);
  103 |     });
  104 | 
  105 |     test('[TW-001] the return URL cannot confirm a payment that FakePay still holds @defect', async ({ request }) => {
  106 |       knownDefect('TW-001', 'GET /checkout/return?status=success credits a processing payment');
  107 |       const ada = await personaApi('ada');
  108 |       const before = (await confirmedTotal(request, PAR.ada)).confirmedTotalMinor;
  109 |       const b = await backViaApi(ada, '1500', CARDS.processing);
  110 |       await ada.get(`/checkout/return?payment=${b.paymentId}&status=success`);
  111 |       expect(await fakepayStatus(request, b.fpRef)).toBe('processing');
  112 |       expect((await confirmedTotal(request, PAR.ada)).confirmedTotalMinor).toBe(before);
  113 |     });
  114 | 
  115 |     test('[TW-002] replaying a payment.succeeded webhook credits the payment only once @defect', async ({ request }) => {
  116 |       knownDefect('TW-002', 'FakePay replays add a new ledger credit each time');
  117 |       const kofi = await personaApi('kofi');
  118 |       const before = (await confirmedTotal(request, PAR.kofi)).confirmedTotalMinor;
  119 |       const b = await backViaApi(kofi, '100', CARDS.ok, 'GHS'); // GHS 100 = ₦11,800
  120 |       await expect.poll(async () => (await confirmedTotal(request, PAR.kofi)).confirmedTotalMinor).toBe(before + 1_180_000);
  121 |       const ev = await fakepayEventId(request, b.fpRef, 'payment.succeeded');
  122 |       expect(ev).toBeTruthy();
  123 |       for (let i = 0; i < 2; i++) await fakepayAction(request, ev!, 'replay');
  124 |       await new Promise((r) => setTimeout(r, 3000));
  125 |       expect((await confirmedTotal(request, PAR.kofi)).confirmedTotalMinor).toBe(before + 1_180_000);
  126 |     });
  127 | 
  128 |     test('out-of-order processing event does not downgrade a succeeded payment', async ({ request }) => {
  129 |       const kofi = await personaApi('kofi');
  130 |       const b = await backViaApi(kofi, '10', CARDS.ok, 'GHS');
  131 |       await waitForEngineStatus(request, PAR.kofi, b.paymentId, 'succeeded');
  132 |       const ev = await fakepayEventId(request, b.fpRef, 'payment.processing');
  133 |       await fakepayAction(request, ev!, 'replay');
  134 |       await new Promise((r) => setTimeout(r, 2000));
  135 |       const row = (await staffGet(request, `/api/staff/payments?participantId=${PAR.kofi}`)).find((p: any) => p.id === b.paymentId);
  136 |       expect(row.status).toBe('succeeded');
  137 |     });
  138 | 
  139 |     test('[TW-003] a stale succeeded event cannot resurrect a refunded payment @defect', async ({ request }) => {
  140 |       knownDefect('TW-003', 'replayed payment.succeeded flips refunded back to succeeded and re-credits');
  141 |       const bayo = await personaApi('bayo');
  142 |       const b = await backViaApi(bayo, '2000', CARDS.ok);
  143 |       await waitForEngineStatus(request, PAR.bayo, b.paymentId, 'succeeded');
  144 |       const refund = await request.post('/api/staff/refunds', { headers: bearer(TOKENS.admin), data: { paymentId: b.paymentId } });
  145 |       expect(refund.ok()).toBeTruthy();
  146 |       await waitForEngineStatus(request, PAR.bayo, b.paymentId, 'refunded');
  147 |       const ev = await fakepayEventId(request, b.fpRef, 'payment.succeeded');
  148 |       await fakepayAction(request, ev!, 'replay');
  149 |       await new Promise((r) => setTimeout(r, 3000));
  150 |       expect(await fakepayStatus(request, b.fpRef)).toBe('refunded');
  151 |       expect(await engineStatus(request, PAR.bayo, b.paymentId)).toBe('refunded');
  152 |     });
  153 | 
  154 |     test('[TW-008] a refund removes the backing from the confirmed total (seed persona zara) @defect', async ({ request }) => {
  155 |       knownDefect('TW-008', 'confirmed total ignores ledger reversals');
  156 |       const payments = await staffGet(request, `/api/staff/payments?participantId=${PAR.zara}`);
  157 |       expect(payments.every((p: any) => p.status === 'refunded')).toBeTruthy();
  158 |       const total = await confirmedTotal(request, PAR.zara);
  159 |       expect(total.confirmedTotalMinor).toBe(0);
  160 |       expect(total.level).toBe('');
  161 |     });
  162 | 
  163 |     test('[TW-016] paying the same quote twice (double submit) charges only once @defect', async ({ request }) => {
  164 |       knownDefect('TW-016', 'each POST /checkout/pay creates a new payment and FakePay session for the same quote');
  165 |       const bayo = await personaApi('bayo');
  166 |       const q = await bayo.post('/checkout/quote', { form: { campaign: 'harmattan-sessions', currency: 'NGN', amount: '1000', terms: 'yes' } });
  167 |       const quoteId = (await q.text()).match(/quo_[0-9a-f]+/)![0];
  168 |       const [first, second] = await Promise.all([1, 2].map(() => bayo.post('/checkout/pay', { form: { quote: quoteId }, maxRedirects: 0 })));
  169 |       const sessions = new Set([first, second].map((r) => r.headers()['location']));
  170 |       expect(sessions.size, `FakePay sessions for one quote: ${[...sessions].join(', ')}`).toBe(1);
  171 |     });
  172 | 
  173 |     test('[TW-006] a payment confirmed after it expired is still credited (PR7) @defect', async ({ request }) => {
  174 |       knownDefect('TW-006', 'late payment.succeeded for an expired payment is ignored');
  175 |       const musa = await personaApi('musa');
  176 |       const before = (await confirmedTotal(request, PAR.musa)).confirmedTotalMinor;
  177 |       const b = await backViaApi(musa, '10000', CARDS.processing);
  178 |       await advanceEngineClock(request, 40);
  179 |       const ev = await fakepayEventId(request, b.fpRef, 'payment.succeeded');
  180 |       await fakepayAction(request, ev!, 'release');
  181 |       await expect.poll(() => fakepayStatus(request, b.fpRef)).toBe('succeeded');
  182 |       await expect.poll(async () => (await confirmedTotal(request, PAR.musa)).confirmedTotalMinor, { timeout: 8000 }).toBe(before + 1_000_000);
  183 |     });
  184 |   });
  185 | 
  186 |   test.describe('referrals', () => {
  187 |     test('[TW-010] referral credit is 5% of the backing, fee excluded (PR10) @defect', async ({ request }) => {
  188 |       knownDefect('TW-010', 'credit computed on backing + fee');
  189 |       const friend = await pwRequest.newContext({ baseURL: URLS.engine });
  190 |       const name = `friend${uid()}`;
  191 |       const join = await friend.post('/join', {
  192 |         form: { ref: 'MUSA-7Q', username: name, first_name: 'Friend', last_name: 'Test', email: `${name}@example.test`, currency: 'NGN', password: 'listen123' },
```