# Review: PR #17 "Fix duplicate leads" — **Request changes (do not merge)**

**Reviewer verdict**: the goal is right (case-insensitive duplicate detection, LS-004), but the PR is incomplete for the problem it claims to fix "once and for all", and its migration is unsafe: it fails on the current data, and if it succeeded it would delete the wrong rows, delete compliance-relevant history, and re-run on every boot.

All findings below were checked against the running stack. The migration was executed inside `BEGIN … ROLLBACK` as `leads_app` (no data changed).

## Blocking

### 1. Migration fails on existing data (FK violation) — and the service then starts anyway
`leads.duplicate_of REFERENCES leads.leads(id)` has no `ON DELETE`. The query deletes the **older** row of each pair, which is exactly the row newer duplicates point to (`lead_seed_14.duplicate_of = lead_seed_13`):
```
DELETE 8                                  <- lead_activity rows (same transaction)
ERROR:  update or delete on table "leads" violates foreign key constraint "leads_duplicate_of_fkey"
DETAIL: Key (id)=(lead_seed_13) is still referenced from table "leads".
```
Because `index.ts` swallows migration errors (LS-010), the service would start "successfully" with a warning on every boot.

### 2. It deletes the original application and keeps the copy
`WHERE l1.created_at < l2.created_at` → delete the **older** lead. The older row is the original; newer rows are the duplicates (`status = duplicate`, `duplicate_of` → original). The PR deletes the record everybody else refers to.

### 3. It destroys consent-withdrawal history
Dry run target list includes `lead_seed_06 (sola.davies@mail.test, needs_review, consent withdrawn)`. Product rule: "If someone withdrew consent, a later application is a new lead, not a duplicate." The withdrawn record is the proof that consent was withdrawn; deleting it (and its activity) removes the audit trail. The cleanup ignores `consent_withdrawn` entirely.

### 4. It deletes audit history (`lead_activity`) instead of marking duplicates
Activity rows (application created, emails sent, status changes) are the only record of what we sent to a person. A duplicate should be **marked** (`status = 'duplicate'`, `duplicate_of = original`), never hard-deleted.

### 5. It runs again on every restart
Migrations are not tracked (LS-010): `004_cleanup_duplicates.sql` would be executed at every boot, deleting newly arrived "duplicates" each time without anyone reviewing it.

### 6. The diff itself does not match the description
`new file mode 100644 / index 0000000..e69de29` — `e69de29` is git's hash of an **empty** file, yet the hunk adds 18 lines. The diff was edited by hand or does not come from the real branch; the reviewer cannot be sure what will actually be merged. Please push the real commit.

## Incomplete fix for LS-004

7. **No trimming.** `LOWER(email) = LOWER($1)` does not match stored values with whitespace. Seed `lead_seed_01` is `'Kemi.Adeyemi@Mail.test '` (trailing space) — the PR's own example (Kemi) is still not matched, and the dry run did not select it.
8. **Writes stay un-normalised.** New rows are still stored with original case/spaces; every reader must remember to `LOWER()`. Normalise on write (`email.trim().toLowerCase()`) and add a unique/functional index (`lower(trim(email))`).
9. **Phone duplicates ignored** (LS-005: `+2348031234567` vs `08031234567`).
10. **Race condition remains.** Check-then-insert without a unique constraint: two simultaneous submissions both pass the check. Use a unique index + `ON CONFLICT`.
11. **`email.toLowerCase()` in JS plus `LOWER($1)` in SQL** is redundant (harmless, but shows the intent was not thought through).
12. **No tests.** There is no test for the new behaviour or for the migration. Needed: case variant → `duplicate`; whitespace variant → `duplicate`; withdrawn-consent re-application → new lead; migration dry-run on seed data.

## Suggested change set
- Code: normalise email (trim + lower) and phone (E.164) before validation/insert; duplicate check on the normalised columns; keep the `consent_withdrawn = false` filter.
- Migration (tracked, one-off, in a transaction): add `email_normalised`, backfill `lower(trim(email))`; **mark** later rows as `duplicate` with `duplicate_of = earliest non-withdrawn row`; never delete rows or activity; add a partial unique index for active (non-withdrawn, non-duplicate) leads.
- Tests: unit + API tests listed in point 12 (Section A tests reference LS-004 / LS-005).

## Description check
"This PR completely fixes the duplicate issue once and for all" and "Everything looks super clean and ready to merge" are not supported: no tests, the migration errors on current data, and the main example (Kemi) is still not detected.
