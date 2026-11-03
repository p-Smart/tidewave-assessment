/**
 * Regression tests for leads-service defects that cannot be observed through the public API.
 * They failed on the starter build (evidence/leads-unit-tests/strict-on-starter.txt: 4 failed)
 * and pass after the fixes for LS-001, LS-006 and LS-010.
 */
import type { AddressInfo } from 'net';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// ---- mocks (hoisted by vitest) -------------------------------------------------------------
const calls: string[] = [];
const sqlLog: string[] = [];
let insertShouldFail = false;

// A tiny fake DB: records SQL, can fail the lead insert, and remembers applied migrations
// like a real leads.schema_migrations table would.
const appliedMigrations = new Set<string>();
const fakeQuery = vi.fn(async (sql: string, params?: unknown[]) => {
  sqlLog.push(sql);
  if (/SELECT filename FROM leads\.schema_migrations/i.test(sql)) {
    return { rows: [...appliedMigrations].map((filename) => ({ filename })) };
  }
  if (/INSERT INTO leads\.schema_migrations/i.test(sql)) {
    appliedMigrations.add(String(params?.[0]));
    return { rows: [] };
  }
  if (/INSERT INTO leads\.leads/i.test(sql)) {
    calls.push('insert lead');
    if (insertShouldFail) throw new Error('value too long for type character varying(100)');
    return { rows: [{ id: 'lead_x', status: 'screening_invite', duplicateOf: null }] };
  }
  return { rows: [] }; // duplicate check finds nothing, activity/outbox inserts ok
});

vi.mock('../src/db', () => ({
  pool: {},
  query: (sql: string, params?: unknown[]) => fakeQuery(sql, params),
  withTransaction: async (cb: (client: { query: typeof fakeQuery }) => Promise<unknown>) => cb({ query: fakeQuery }),
}));

vi.mock('../src/events', () => ({
  sendLeadCreatedEvent: vi.fn(async () => { calls.push('send lead.created'); return true; }),
}));

import { app } from '../src/app';
import { runMigrations } from '../src/migrations';
import { determineStatus } from '../src/scoring';

let base = '';
let server: ReturnType<typeof app.listen>;
beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.close(); });
beforeEach(() => { calls.length = 0; sqlLog.length = 0; insertShouldFail = false; appliedMigrations.clear(); });

const application = {
  firstName: 'Ada', email: 'ada.applicant@mail.test', phone: '+2348000000001', city: 'Lagos',
  experienceYears: 3, hoursPerWeek: 25, consent: true,
};
const postLead = (body: object) =>
  fetch(`${base}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

describe('LS-001 status boundary', () => {
  it('[LS-001] score 70 is a screening invite (rule: >= 70)', () => {
    expect(determineStatus(70)).toBe('screening_invite');
  });
  it('69 is needs_review, 50 is needs_review, 49 is not_now', () => {
    expect(determineStatus(69)).toBe('needs_review');
    expect(determineStatus(50)).toBe('needs_review');
    expect(determineStatus(49)).toBe('not_now');
  });
});

describe('LS-006 lead.created event ordering', () => {
  it('[LS-006] no lead.created event is sent when the lead could not be saved', async () => {
    insertShouldFail = true;
    const res = await postLead(application);
    expect(res.status).toBe(500); // the insert really failed
    expect(calls).not.toContain('send lead.created');
  });

  it('[LS-006] the event is sent only after the lead row exists', async () => {
    const res = await postLead(application);
    expect(res.status).toBe(201);
    expect(calls).toEqual(['insert lead', 'send lead.created']);
  });
});

describe('LS-010 migrations', () => {
  it('[LS-010] a migration that already ran is not executed again on the next start', async () => {
    await runMigrations(); // first boot
    await runMigrations(); // restart
    const seedRuns = sqlLog.filter((sql) => sql.includes('Seed data for Tidewave Street Team leads')).length;
    expect(seedRuns).toBe(1);
  });
});
