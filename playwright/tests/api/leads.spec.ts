import { test, expect } from '@playwright/test';
import {
  TOKENS, URLS, bearer, createLead, leadPayload, resetAll, settledMailCount,
} from '../../fixtures';

test.describe('Leads service API', () => {
  test.beforeAll(async () => { await resetAll(); });

  test.describe('happy path', () => {
    test('qualifying applicant gets screening_invite and exactly one invite email with an activity entry', async ({ request }) => {
      const lead = leadPayload({ experienceYears: 3, hoursPerWeek: 25, city: 'Accra' }); // 40 + 30 + 30
      const res = await createLead(request, lead);
      expect(res.status()).toBe(201);
      const body = await res.json();
      expect(body).toMatchObject({ status: 'screening_invite', duplicateOf: null });

      expect(await settledMailCount(request, lead.email as string, 1, 'Street Team')).toBe(1);
      await expect.poll(async () => {
        const acts = await (await request.get(`${URLS.leads}/leads/${body.id}/activity`, { headers: bearer(TOKENS.viewer) })).json();
        return acts.map((a: any) => a.type);
      }).toEqual(['application_created', 'email_sent']);
    });

    test('scoring follows the rules: hours are floored, non-priority city gets 10', async ({ request }) => {
      // 1 y = 20, 19.9 h -> 19 = 20, Ibadan = 10 -> 50 -> needs_review
      const res = await createLead(request, leadPayload({ experienceYears: 1, hoursPerWeek: 19.9, city: 'Ibadan' }));
      expect((await res.json()).status).toBe('needs_review');
      // 0 y, 9.9 h -> 9 = 0, Abuja = 30 -> 30 -> not_now
      const low = await createLead(request, leadPayload({ experienceYears: 0, hoursPerWeek: 9.9, city: 'Abuja' }));
      expect((await low.json()).status).toBe('not_now');
    });

    test('a person who withdrew consent and applies again is a new lead, not a duplicate', async ({ request }) => {
      // seed lead_seed_06 (sola.davies@mail.test) withdrew consent; lead_seed_07 is the new application
      const res = await request.get(`${URLS.leads}/leads/lead_seed_07`, { headers: bearer(TOKENS.viewer) });
      expect((await res.json()).duplicateOf).toBeNull();
    });

    test('an exact duplicate (same email) is marked duplicate and gets no email', async ({ request }) => {
      const first = leadPayload({ experienceYears: 0, hoursPerWeek: 0, city: 'Ibadan' }); // not_now: no email either way
      const a = await (await createLead(request, first)).json();
      const b = await (await createLead(request, { ...first, phone: '+2348099999999' })).json();
      expect(b).toMatchObject({ status: 'duplicate', duplicateOf: a.id });
    });
  });

  test.describe('validation and authorisation', () => {
    for (const field of ['firstName', 'email', 'phone', 'city']) {
      test(`missing ${field} is rejected with 422`, async ({ request }) => {
        const payload: Record<string, unknown> = leadPayload();
        delete payload[field];
        const res = await createLead(request, payload);
        expect(res.status()).toBe(422);
        expect((await res.json()).errors.map((e: any) => e.field)).toContain(field);
      });
    }

    test('consent must be true (422)', async ({ request }) => {
      const res = await createLead(request, leadPayload({ consent: false }));
      expect(res.status()).toBe(422);
    });

    test('lead list needs a staff token', async ({ request }) => {
      expect((await request.get(`${URLS.leads}/leads`)).status()).toBe(401);
      expect((await request.get(`${URLS.leads}/leads`, { headers: bearer(TOKENS.automation) })).status()).toBe(401);
    });
  });

  // Defects from the code review. Each failed on the starter build (evidence/playwright-strict-starter)
  // and is fixed in leads-service; these are now regression tests.
  test.describe('fixed defects (leads-service code review)', () => {
    test('[LS-001] a score of exactly 70 is a screening invite @regression', async ({ request }) => {
      const res = await createLead(request, leadPayload({ experienceYears: 3, hoursPerWeek: 5, city: 'Lagos' })); // 40+0+30
      expect((await res.json()).status).toBe('screening_invite');
    });

    test('[LS-002] status can never be set to "active" @regression', async ({ request }) => {
      const res = await request.patch(`${URLS.leads}/leads/lead_seed_10/status`, { headers: bearer(TOKENS.admin), data: { status: 'active' } });
      expect(res.status()).toBe(422);
    });

    test('[LS-003] a staff viewer cannot change a lead status @regression', async ({ request }) => {
      const res = await request.patch(`${URLS.leads}/leads/lead_seed_11/status`, { headers: bearer(TOKENS.viewer), data: { status: 'not_now' } });
      expect(res.status()).toBe(403);
    });

    test('[LS-004] the same email in different letter case is a duplicate @regression', async ({ request }) => {
      const first = leadPayload({ experienceYears: 0, hoursPerWeek: 0, city: 'Ibadan' });
      const a = await (await createLead(request, first)).json();
      const b = await (await createLead(request, { ...first, email: (first.email as string).toUpperCase(), phone: '+2348077777777' })).json();
      expect(b).toMatchObject({ status: 'duplicate', duplicateOf: a.id });
    });

    test('[LS-005] the same phone in national and international format is a duplicate @regression', async ({ request }) => {
      const n = String(Math.floor(10_000_000 + Math.random() * 89_999_999));
      const a = await (await createLead(request, leadPayload({ phone: `+23480${n}`, experienceYears: 0, hoursPerWeek: 0, city: 'Ibadan' }))).json();
      const b = await (await createLead(request, leadPayload({ phone: `080${n}`, experienceYears: 0, hoursPerWeek: 0, city: 'Ibadan' }))).json();
      expect(b).toMatchObject({ status: 'duplicate', duplicateOf: a.id });
    });

    test('[LS-007] rendering without a variable never prints "undefined" @regression', async ({ request }) => {
      const res = await request.post(`${URLS.leads}/templates/solace-intro/render`, { headers: bearer(TOKENS.viewer), data: { variables: {} } });
      const r = await res.json();
      expect(r.html).not.toContain('undefined');
    });

    test('[LS-008] negative hours / experience are rejected with 422 @regression', async ({ request }) => {
      const res = await createLead(request, leadPayload({ experienceYears: -5, hoursPerWeek: -40, city: 'Ibadan' }));
      expect(res.status()).toBe(422);
    });

    test('[LS-009] an over-long first name is a 422 validation error, not a 500 @regression', async ({ request }) => {
      const res = await createLead(request, leadPayload({ firstName: 'A'.repeat(101), experienceYears: 0, hoursPerWeek: 0, city: 'Ibadan' }));
      expect(res.status()).toBe(422);
    });

    // LS-006 (event before insert) and LS-010 (migrations re-run) are proven by unit tests in
    // leads-service/test/ because they need to observe internals (event call order, SQL executed).
  });

  test.afterAll(async () => { await resetAll(); });
});

