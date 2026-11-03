# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: api/engine.spec.ts >> Engine API >> referrals >> [TW-010] referral credit is 5% of the backing, fee excluded (PR10) @defect
- Location: tests/api/engine.spec.ts:187:9

# Error details

```
Error: credit for a ₦10,000 backing (fee ₦250)

expect(received).toBe(expected) // Object.is equality

Expected: "₦500.00"
Received: "₦512.50"
```

# Test source

```ts
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
  193 |         maxRedirects: 0,
  194 |       });
  195 |       expect(join.headers()['location']).toBe('/me');
  196 |       const b = await backViaApi(friend, '10000', CARDS.ok);
  197 |       await expect.poll(async () => (await verifiedPayment(request, b.paymentId)).status).toBe('succeeded');
  198 |       await new Promise((r) => setTimeout(r, 3000)); // credit is written when the webhook lands
  199 |       const musa = await personaApi('musa');
  200 |       const page = await (await musa.get('/me/referrals')).text();
  201 |       const text = page.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  202 |       const credit = text.match(/Friend (₦[\d,.]+) held/)?.[1];
> 203 |       expect(credit, 'credit for a ₦10,000 backing (fee ₦250)').toBe('₦500.00');
      |                                                                 ^ Error: credit for a ₦10,000 backing (fee ₦250)
  204 |     });
  205 |   });
  206 | 
  207 |   test.afterAll(async () => { await resetAll(); }); // undo the clock move and refunds
  208 | });
  209 | 
```