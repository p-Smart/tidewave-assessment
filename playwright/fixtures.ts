import crypto from 'crypto';
import { APIRequestContext, Page, expect, request as pwRequest, test } from '@playwright/test';

export const URLS = {
  engine: 'http://localhost:7080',
  fakepay: 'http://localhost:7090',
  leads: 'http://localhost:7081',
  ops: 'http://localhost:7300',
  n8n: 'http://localhost:7678',
  mailpit: 'http://localhost:7025',
};

// Assessment-only tokens published in docs/SETUP.md (not real secrets).
export const TOKENS = {
  admin: 'tw_staff_admin_5f2c9a',
  viewer: 'tw_staff_viewer_81d4e0',
  automation: 'tw_automation_3b7e11',
  tools: 'tw_tools_c0ffee',
};
export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

export const CARDS = {
  ok: '4242 4242 4242 4242',
  declined: '4000 0000 0000 0002',
  processing: '4000 0000 0000 0259', // held until released in the FakePay dashboard
};

export const PRODUCTION_EVENTS_URL = 'http://n8n:5678/webhook/solace-events';

/** Unique suffix so repeated runs never collide (emails stay on the .test domain). */
export const uid = () => `${Date.now().toString(36)}${crypto.randomBytes(2).toString('hex')}`;

/**
 * Mark a test as reproducing a known, ticketed defect. The test asserts the CORRECT behaviour.
 * Default run: expected to fail (suite stays green). STRICT_DEFECTS=1: fails red.
 * If the defect gets fixed, Playwright reports "unexpectedly passed" -> remove the marker.
 */
export function knownDefect(ticket: string, summary: string) {
  test.info().annotations.push({ type: 'defect', description: `${ticket}: ${summary} (see tickets/)` });
  test.fail(process.env.STRICT_DEFECTS !== '1', `Known defect ${ticket} — fails on the starter build`);
}

/**
 * Reset all services back to seed data, then repair the engine's n8n events URL
 * (an engine reset restores the broken /webhook-test/ URL, ticket TW-015).
 */
export async function resetAll() {
  const headers = bearer(TOKENS.tools);
  const [resEngine, resLeads] = await Promise.all([
    fetch(`${URLS.engine}/__tools/reset`, { method: 'POST', headers }).catch((err) => ({ ok: false, status: 0, statusText: String(err) })),
    fetch(`${URLS.leads}/__tools/reset`, { method: 'POST', headers }).catch((err) => ({ ok: false, status: 0, statusText: String(err) })),
  ]);
  if (!resEngine.ok || !resLeads.ok) {
    throw new Error(`resetAll failed: engine=${'status' in resEngine ? resEngine.status : 'error'}, leads=${'status' in resLeads ? resLeads.status : 'error'}`);
  }
  await setEventsUrl(PRODUCTION_EVENTS_URL);
}

export async function setEventsUrl(url: string) {
  const res = await fetch(`${URLS.engine}/api/staff/settings`, {
    method: 'PUT',
    headers: { ...bearer(TOKENS.admin), 'Content-Type': 'application/json' },
    body: JSON.stringify({ n8nEventsUrl: url }),
  });
  if (!res.ok) throw new Error(`could not set n8nEventsUrl: ${res.status}`);
}

/** Log in to the public website as a specific persona (browser). */
export async function loginAs(page: Page, persona: string) {
  await page.goto('/login');
  await page.getByLabel('Username').fill(persona);
  await page.getByLabel('Password').fill('listen123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await page.waitForURL('**/me');
}

/** Log in to the staff ops console (browser). */
export async function opsLogin(page: Page, role: 'Admin' | 'Viewer') {
  await page.goto(`${URLS.ops}/login`);
  await page.getByRole('button', { name: `Sign in as ${role}` }).click();
  await page.waitForURL('**/leads');
}

/** API context logged in as a persona (cookies are kept by the context). */
export async function personaApi(persona: string): Promise<APIRequestContext> {
  const api = await pwRequest.newContext({ baseURL: URLS.engine });
  const res = await api.post('/login', { form: { username: persona, password: 'listen123' }, maxRedirects: 0 });
  expect(res.status(), `login ${persona}`).toBe(303);
  expect(res.headers()['location']).toBe('/me');
  return api;
}

export interface Backing { quoteId: string; fpRef: string; paymentId: string; returnUrl: string; }

/** Quote -> pay -> FakePay card, without following the return URL (the browser never "comes back"). */
export async function backViaApi(api: APIRequestContext, amount: string, card: string, currency = 'NGN'): Promise<Backing> {
  const q = await api.post('/checkout/quote', {
    form: { campaign: 'harmattan-sessions', currency, amount, terms: 'yes' }, maxRedirects: 0,
  });
  expect(q.status(), 'quote page').toBe(200);
  const quoteId = (await q.text()).match(/quo_[0-9a-f]+/)![0];
  const p = await api.post('/checkout/pay', { form: { quote: quoteId }, maxRedirects: 0 });
  const fpUrl = p.headers()['location'];
  const fpRef = fpUrl.match(/fp_[0-9a-f]+/)![0];
  const f = await api.post(fpUrl, { form: { card, exp: '12/30', cvc: '123' }, maxRedirects: 0 });
  const returnUrl = f.headers()['location'];
  const paymentId = returnUrl.match(/pay_[0-9a-f]+/)![0];
  return { quoteId, fpRef, paymentId, returnUrl };
}

export async function staffGet(api: APIRequestContext, path: string, token = TOKENS.viewer) {
  const res = await api.get(`${URLS.engine}${path}`, { headers: bearer(token) });
  expect(res.ok(), `${path} -> ${res.status()}`).toBeTruthy();
  return res.json();
}

export async function participant(api: APIRequestContext, id: string) {
  const all = await staffGet(api, '/api/staff/participants');
  return all.find((p: any) => p.id === id);
}

export async function confirmedTotal(api: APIRequestContext, id: string, campaign = 'harmattan-sessions') {
  const p = await participant(api, id);
  return p.campaigns.find((c: any) => c.slug === campaign) as { confirmedTotalMinor: number; level: string };
}

/** Provider-verified payment view (engine asks FakePay). */
export async function verifiedPayment(api: APIRequestContext, paymentId: string) {
  return staffGet(api, `/api/automation/payments/${paymentId}`, TOKENS.automation);
}

/** The engine's OWN payment row (updated by the FakePay webhook, ~2 s after FakePay knows). */
export async function engineStatus(api: APIRequestContext, participantId: string, paymentId: string) {
  const rows = await staffGet(api, `/api/staff/payments?participantId=${participantId}`);
  return rows.find((p: any) => p.id === paymentId)?.status as string | undefined;
}

export async function waitForEngineStatus(api: APIRequestContext, participantId: string, paymentId: string, status: string) {
  await expect.poll(() => engineStatus(api, participantId, paymentId), { timeout: 15_000, message: `engine row ${paymentId}` }).toBe(status);
}

export async function fakepayStatus(api: APIRequestContext, fpRef: string) {
  const res = await api.get(`${URLS.fakepay}/v1/payments/${fpRef}`, { headers: bearer('fp_sk_test_tidewave') });
  return (await res.json()).status as string;
}

/** Find a FakePay webhook event id for a payment on the dashboard. */
export async function fakepayEventId(api: APIRequestContext, fpRef: string, type: string) {
  const html = await (await api.get(`${URLS.fakepay}/dashboard`)).text();
  const m = html.match(new RegExp(`(fpevt_[0-9a-f]+)</code></td><td>${type.replace('.', '\\.')}</td><td>\\d+</td><td><code>${fpRef}`));
  return m?.[1];
}

export async function fakepayAction(api: APIRequestContext, eventId: string, action: 'replay' | 'release') {
  const res = await api.post(`${URLS.fakepay}/dashboard/events/${eventId}/${action}`, { maxRedirects: 0 });
  expect([200, 303]).toContain(res.status());
}

export async function advanceEngineClock(api: APIRequestContext, minutes: number) {
  const res = await api.post(`${URLS.engine}/__tools/clock`, { headers: bearer(TOKENS.tools), data: { advanceMinutes: minutes } });
  expect(res.ok()).toBeTruthy();
}

/** Number of Mailpit messages sent to an address (optionally with a subject fragment). */
export async function mailCount(api: APIRequestContext, to: string, subject?: string) {
  const query = `to:"${to}"` + (subject ? ` subject:"${subject}"` : '');
  const res = await api.get(`${URLS.mailpit}/api/v1/search?query=${encodeURIComponent(query)}&limit=50`);
  return (await res.json()).messages_count as number;
}

/** Wait until at least `min` messages arrived, then a quiet period, and return the final count. */
export async function settledMailCount(api: APIRequestContext, to: string, min: number, subject?: string) {
  await expect.poll(() => mailCount(api, to, subject), { timeout: 25_000, intervals: [500, 1000, 2000] }).toBeGreaterThanOrEqual(min);
  await new Promise((r) => setTimeout(r, 3000)); // late duplicates would show up here
  return mailCount(api, to, subject);
}

export async function createLead(api: APIRequestContext, data: Record<string, unknown>) {
  return api.post(`${URLS.leads}/leads`, { data });
}

export function leadPayload(overrides: Record<string, unknown> = {}) {
  const id = uid();
  return {
    firstName: 'Test', lastName: 'Applicant', email: `applicant.${id}@mail.test`,
    phone: `+23480${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, city: 'Lagos',
    experienceYears: 3, hoursPerWeek: 25, source: 'playwright', consent: true, ...overrides,
  };
}

/** POST a signed event to an n8n webhook, exactly like the engine / leads service do. */
export async function postSignedEvent(api: APIRequestContext, path: string, event: Record<string, unknown>, secret = 'whsec_tidewave_demo_2f9a') {
  const body = JSON.stringify(event);
  const t = Math.floor(Date.now() / 1000);
  const v1 = crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
  return api.post(`${URLS.n8n}/webhook/${path}`, {
    data: body,
    headers: { 'Content-Type': 'application/json', 'X-Tidewave-Event-Id': String(event.id), 'X-Tidewave-Signature': `t=${t},v1=${v1}` },
  });
}

/** Lagos (WAT) rendering of a UTC timestamp, as the receipt should show it: "30 Oct 2026, 00:20". */
export function lagosReceiptDate(iso: string) {
  const d = new Date(iso);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day} ${parts.month} ${parts.year}, ${parts.hour}:${parts.minute}`;
}
