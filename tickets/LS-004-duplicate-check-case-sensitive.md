# LS-004: Duplicate detection is case-sensitive — the same applicant is accepted again and invited twice

**Area**: Leads Service  
**Severity**: High  
**Environment**: Starter build, public `POST /leads`  
**Retest Status**: Fixed — email trimmed + lower-cased on write; duplicate check on `lower(trim(email))` so legacy rows match. Verified: Playwright `[LS-004] … @regression`; n8n also dedups invites per address. Failed on the starter build: `evidence/playwright-strict-starter/`.  

---

## Summary
`WHERE (email = $1 OR phone = $2)` (`src/routes/leads.ts:53`) compares emails byte for byte. Re-applying with different letter case creates a new, non-duplicate lead and a new `lead.created` event. Seed data shows the effect: `lead_seed_01` (`'Kemi.Adeyemi@Mail.test '`, with trailing space) and `lead_seed_02` (`kemi.adeyemi@mail.test`) are both `screening_invite`.

## Steps to Reproduce
1. `POST /leads` with `"email":"ngozi.eze@mail.test"` (phone `+2348090000101`) → `screening_invite`.
2. `POST /leads` with `"email":"NGOZI.Eze@Mail.test"` and a different phone (`+2348090000998`).

## Expected Behavior
Second response: `{"status":"duplicate","duplicateOf":"<first lead>"}`; no second follow-up email ("The same person must not get two follow-up emails").

## Actual Behavior
`{"id":"lead_1793715056565_jxwvq","status":"screening_invite","duplicateOf":null}` and the `lead.created` event fired again.

## Evidence
- Leads `lead_1793713610462_1lz5o` (first) and `lead_1793715056565_jxwvq` (case variant), both `duplicate_of NULL`.
- Mailpit: `ngozi.eze@mail.test` received the street-team invite **four times**, once per lead id:
  | Time (UTC) | Lead | Why it was sent |
  |---|---|---|
  | 13:46:50 | `lead_1793713610462_1lz5o` | original application — legitimate |
  | 14:10:56 | `lead_1793715056565_jxwvq` | this bug (`NGOZI.Eze@Mail.test` not detected as duplicate) |
  | 14:11:25 | `lead_1793715085392_2rpnj` | this bug, while re-testing — our first redeploy of the n8n fix had not been applied (script error) |
  | 14:12:17 | `lead_1793715137489_qfao5` | this bug — fix published, but n8n still served the old version for a few seconds after restart (exec 71 ran the old code) |
- n8n mitigation (Section B): `street-team-lead` now dedups on the normalised email (`street-team-prospect:<lower(email)>`); a further case variant at 14:13:15 (exec 72) was answered `duplicate` and **no email** was sent.
- Automated test: Section A `api` project (references LS-004).

## Notes
Fix: normalise (`trim().toLowerCase()`) on write and compare on `lower(trim(email))`; unique index on the normalised value. PR-17 attempts this but is incomplete — see `PR-17-REVIEW.md`.
