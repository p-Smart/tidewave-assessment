# Solution Submission

**Candidate Name**: AJAYI PRINCE AYOKUNLE
**Repository URL**: https://github.com/p-Smart/tidewave-assessment
**Submission Date**: 3rd November, 2026

Starter v1.1. Everything below was run against the Docker stack on this machine; evidence files are referenced by path.

---

## 1. Technical Decisions and Architecture

### Section B — n8n workflows (`n8n/workflows/`, `leads-service/migrations/003_automation_idempotency.sql`)

- **Root cause of "events don't always arrive"**: the engine setting `n8nEventsUrl` pointed at n8n's *test* URL (`/webhook-test/solace-events`), which only listens while the editor is open. Every delivery got HTTP 404 (`engine.outbox.last_status = 404`). Fixed by setting it to `/webhook/solace-events` via `PUT /api/staff/settings` (ticket TW-015). A reset restores the broken value, so the Playwright `resetAll()` re-applies the fix.
- **Signature check**: every workflow verifies `X-Tidewave-Signature` (`t=…,v1=HMAC-SHA256(t.rawBody)`) on the raw body in a Code node, using `timingSafeEqual`. The secret comes from an environment variable on the n8n container (`TIDEWAVE_EVENTS_SIGNING_SECRET`, with `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`), so it is never stored in workflow JSON. Invalid → 401.
- **Payment verification rule**: `solace-events` never trusts `data.status`. It calls `GET /api/automation/payments/{id}` (which the engine checks with FakePay) and sends the confirmation only when `status === 'succeeded' && verifiedWithProvider`. `failed`/`refunded` → skipped; `processing`/`expired` → 503 "retry later" so the engine's retry schedule re-delivers (PR7).
- **Send-once guarantee**: before any email, the workflow claims a dedup key in Postgres (`automation.message_claims`, `INSERT … ON CONFLICT`, atomic). Keys: `solace-confirmed:<paymentId>`, `solace-intro:<email>`, `street-team-prospect:<email>`, `staff-test-run:<requestId>`. Concurrent or replayed deliveries get `duplicate` (already sent) or `in_progress` (409/503). A failed send releases the claim so the next delivery can retry. Proven with 5 concurrent deliveries → 1 email, and FakePay replays → 1 email.
- **Resilience**: HTTP nodes retry 3–5× with error outputs; email node retries 3×. Engine 503 ×2 (`/__tools/chaos`) absorbed by retries; ×10 → 503 answered, nothing sent, first delivery after the outage sends once. Mailpit 451 at 100 % → 502 + claim marked failed; retry after chaos off → sent once.
- **street-team-lead**: the forbidden "active rep" subject is removed; only `screening_invite` leads (read from the leads service, not the event) are emailed; a content guard refuses any rendered email containing *hired / active / field ready*; `email_sent` activity is written back; `Get Lead` retries to survive the leads-service race (LS-006).
- **staff-test-run**: recipient hard-coded to `staff-test@tidewave.test`; approved templates only (draft → 422, unknown → 404, malformed key → 400); required variables checked; response built as JSON, not string-interpolated.
- **Audit trail**: `saveDataSuccessExecution: all` (the starter saved nothing). All 704 executions are in `evidence/n8n-executions.json` with per-node results (702 success; the 2 errors are executions 1–2 at 13:30/13:34, the *starter* `staff-test-run` workflow receiving `setup-check`'s empty `{}` probe before any change was made). Workflows were authored as code (`tools/dev/gen_workflows.py`), imported, then exported back with `node tools/tw.mjs export-n8n`.

### Section C — investigation (`tickets/`)

- `tickets/TEST_PLAN.md` (approach + 11 open questions), 32 tickets, `tickets/PR-17-REVIEW.md`. Every ticket has reproduction steps and runtime evidence; all 39 engine request ids quoted in tickets are present in `evidence/engine-log.signed.json` (checked by script before export).
- PR-17: **request changes**. Its migration was executed inside `BEGIN … ROLLBACK` on the live DB: it fails with a foreign-key violation (`lead_seed_13` referenced by `lead_seed_14`), would delete the *original* applications, delete the withdrawn-consent record, and re-run on every boot (LS-010). It also still misses the trailing-space email it claims to fix.
- Defects in open components were fixed (13 tickets) with before/after evidence; engine defects (closed) are reported only.

### Section A — Playwright (`playwright/`)

- Three projects (`api`, `storefront`, `ops`), Chromium only, trace + screenshot on every test, one worker (shared stateful stack), every spec starts and ends with `resetAll()`. 81 tests, 0 retries, no flaky tests in the recorded runs.
- **Known-defect pattern**: each ticket has a test asserting the *correct* behaviour, marked `knownDefect('<ticket>')` → "expected to fail" in normal runs (suite green, CI passes); `STRICT_DEFECTS=1` makes them fail red with the actual value. `evidence/playwright-strict-starter/` is that run on the untouched starter (28 failed = exactly the defect tests). After fixing our own code, 12 of them became `@regression` tests; the 16 still-open defects (15 engine + OPS-001) stay `@defect`. A fixed defect whose marker was forgotten would show as "unexpectedly passed", so markers cannot go stale.
- Leads-service internals (event order, migrations) are covered by vitest in `leads-service/test/defects.test.ts`; the same file was run against the starter code in a git worktree (`evidence/leads-unit-tests/strict-on-starter.txt`, 4 failed).
- CI (`.github/workflows/ci.yml`) now also starts the ops console and runs the leads unit tests.

### Section D — emails and staff screen

- Templates use a fluid table layout (`width:100%; max-width:600px`, inline styles, media query for ≤480px), hidden preheader, button CTA + plain link, disclaimers from the briefs, unsubscribe link, `{{#if}}` fallbacks. The engine has no unsubscribe page (question 11), so an optional `unsubscribeUrl` variable falls back to `mailto:`.
- Renderer hardening (`leads-service/src/templates.ts`): plain-text part no longer starts with CSS; variables named `…Url` must be `http(s)`/`mailto` or they fall back to the template default (a `javascript:` URL survived Handlebars escaping).
- `/messages/test`: approved-only dropdown, inputs generated from `variables` (label, required mark, example placeholder), inline validation, debounced live preview in `<iframe sandbox="" srcdoc>`, "Send TEST run" with success / duplicate / error notices. One `requestId` per form state → a double click sends one email.
- Verified at 375 px by Playwright (no horizontal overflow, ≥44 px tap target, required wording present, forbidden wording absent) and by screenshots in `evidence/screenshots/`.

### Fixes in open components (all with a failing-then-passing test)

| Area | Tickets | Change |
|---|---|---|
| leads-service | LS-001 | `>= 70` → `screening_invite` |
| | LS-002, LS-003 | no `active`; PATCH admin-only; actor recorded |
| | LS-004, LS-005 | email normalised on write; duplicates by `lower(trim(email))` or national phone number |
| | LS-006 | lead + activity + outbox in one transaction; event sent after commit; outbox status recorded |
| | LS-007 | missing variables → `''` (fallbacks), never `undefined` |
| | LS-008, LS-009 | numeric ranges and max lengths → 422 |
| | LS-010 | `leads.schema_migrations`; migrations run once; startup exits on failure |
| ops-console | OPS-002 | server-side search |
| | OPS-003 | currency-aware minor units (XOF) |
| | OPS-004 | nav re-reads role on route change |
| | OPS-005 | activity `detail` rendered as text (page crashed for every lead) |
| n8n / engine config | TW-015 | events URL (configuration) |

---

## 2. AI Disclosure Table

| Tool / Model | Section & Feature | What Was Prompted | What You Accepted vs Changed | What You Personally Ran and Verified |
|---|---|---|---|---|
| Claude Code, Claude Opus 5.5 | Orientation and assessment planning | "Assessment. Go through the assessment source code and explain exactly what I am to do" | Used the assessment breakdown and chose the work order: Section B, then C, A, and D. | Started the Docker stack and ops console; ran `node tools/tw.mjs setup-check`; reviewed service status and completed setup before starting the assessment. |
| Claude Code, Claude Opus 5.5 | Section B: n8n workflows and resilience | "Let's start section B" | Reviewed and accepted signed webhooks, engine-side payment verification, PostgreSQL idempotency, retries, `.test`-only recipients, and execution audit history. Required concise commit messages and no AI co-author line. | Imported and published the workflows; exercised signed event deliveries, replay and concurrency cases, engine 503 chaos, and Mailpit 451 chaos; reviewed n8n execution history and Mailpit results; created and pushed the Section B commit. |
| Claude Code, Claude Opus 5.5 | Section C: test plan, bug hunt, tickets, and PR-17 review | "Let's go ahead with C" | Reviewed and accepted evidence-backed defects; kept unproven or ambiguous behaviour as test-plan questions rather than tickets; accepted the PR-17 recommendation to request changes. | Exercised website, payment, webhook, and leads-service scenarios; reviewed API/network results, read-only database evidence, signed request logs, tickets, and the PR-17 migration review; created and pushed the Section C commit. |
| Claude Code, Claude Opus 5.5 | Section A: Playwright, leads-service tests, CI, and open-component fixes | "Pushed. Now let's do Section A" and later "time permits fix them" | Accepted the known-defect and regression-test structure; selected the open-component fixes to include; kept OPS-001 open because proper authentication needs a defined product decision. | Installed and ran the Playwright suite and leads-service tests; reviewed starter, strict-after-fixes, and normal-run reports/traces; verified `playwright/test-results` was tracked with `git ls-files`; reviewed CI configuration and created and pushed the Section A commit. |
| Claude Code, Claude Fable 5.1 | Section D: email templates and staff test screen | "No. Let's do the last section now" and later "Keeping the report as files" | Reviewed and accepted the responsive templates, renderer hardening, generated staff-test form fields, sandboxed preview, validation, and deduplicated test sending. Chose to preserve the browsable HTML report rather than zip it. | Tested the templates and staff screen at desktop and 375px mobile width; reviewed Mailpit, n8n, and screenshot evidence; reran the full suite and confirmed the clean result; created and pushed the Section D commit. |
| Claude Code, Claude Fable 5.1 | Wrap-up: `SOLUTION.md`, workflow export, evidence export, and final repository review | "why do we have 438 changes?", "why am I seeing many deleted files in changes? just answer the question", "so it's okay to commit all again?", and "what's next?" | Reviewed the final solution report, workflow exports, evidence artifacts, helper scripts, traceability, and stated gaps; retained responsibility for final disclosure accuracy and submission contents. | Ran `node tools/tw.mjs export-n8n`; verified the exported workflow changes; ran final test and evidence checks; ran `node tools/tw.mjs evidence`; reviewed the signed engine log, Mailpit export, n8n execution export, working tree, and commit history before the final commit and push. |

I used Claude Code as a pair-programming, research, implementation, and test-automation assistant. I chose the section order, reviewed findings and runtime evidence throughout, decided which fixes and trade-offs to accept, personally performed the verification and export steps listed above, and controlled all commits and pushes.

---

## 3. Verification and Status Table

| Item / Feature | Status | Evidence Link / File Reference | Notes |
|---|---|---|---|
| Playwright Suite (Section A) | PASS | `playwright/playwright-report/`, `playwright/test-results/`, `evidence/playwright-final-run.txt` | 81 passed, 0 flaky, 0 retries. Strict run on the starter: `evidence/playwright-strict-starter/` (28 defect tests failed); strict run after fixes: `evidence/playwright-strict-after-fixes.txt` (16 open defects fail, 12 regressions pass) |
| Leads-service unit tests | PASS | `leads-service/test/`, `evidence/leads-unit-tests/strict-on-starter.txt` | 12 passed; 4 failed on the starter code |
| Lead Creation Workflow (Section B) | PASS | `n8n/workflows/street-team-lead.json`, `evidence/n8n-executions.json`, `evidence/screenshots/n8n-wf_street_team_lead.png`, `tests/api/leads.spec.ts` ("exactly one invite email") | Signature, screening_invite only, content guard, per-address dedup, activity written |
| Solace Events Workflow (Section B) | PASS | `n8n/workflows/solace-events.json`, `evidence/n8n-executions.json`, `evidence/screenshots/n8n-wf_solace_events.png`, `tests/api/automation.spec.ts`, `tests/storefront/visitor.spec.ts` | Verified-with-engine rule, 1 email despite replays + 503 burst, no email while processing, forged status skipped |
| Staff Test Run Workflow (Section B) | PASS | `n8n/workflows/staff-test-run.json`, `tests/api/automation.spec.ts`, `tests/ops/messages-test.spec.ts` | Recipient fixed, drafts refused, double submit = 1 email, Mailpit 451 recovery (`automation.message_claims` rows) |
| Engine 503 / Mailpit 451 recovery | PASS | `tests/api/automation.spec.ts` (engine 503 burst, automated); `evidence/section-c-leads-and-claims.txt` (`staff-test-run:req_mailchaos_*` rows: `failed` → `sent` after Mailpit chaos), `evidence/n8n-executions.json` | Mailpit 451 was driven manually via `PUT /api/v1/chaos` (100 % → 502 and claim released; chaos off → same request sent once) |
| Engine Bug Findings (Section C) | FAIL (16 open defects) | `tickets/README.md`, `evidence/engine-log.signed.json`, `evidence/section-c-engine-log.signed.json` | 17 engine/website tickets (TW-015 fixed by configuration), 4 Critical (TW-001..004); every request id quoted is present in the signed log |
| Leads Service Review & PR-17 (Section C) | PASS (reviewed; 10 defects fixed) | `tickets/PR-17-REVIEW.md`, `tickets/LS-*.md` | PR-17: request changes (migration fails on FK, deletes originals) |
| Ops console defects | 4 fixed, OPS-001 open | `tickets/OPS-*.md`, `tests/ops/ops-console.spec.ts` | OPS-001 needs real authentication |
| Street Team Email Template (Section D) | PASS | `templates/street-team-prospect.html`, `evidence/screenshots/email-street-team-prospect-375px.png`, `tests/storefront/email-templates.spec.ts` | Brief items checked by test |
| Solace Intro Email Template (Section D) | PASS | `templates/solace-intro.html`, `evidence/screenshots/email-solace-intro-375px.png`, same test file | |
| Ops Console Test Screen (Section D) | PASS | `ops-console/src/app/messages/test/page.tsx`, `evidence/screenshots/ops-messages-test-filled.png`, `tests/ops/messages-test.spec.ts` | Send verified end-to-end into Mailpit |
| Mailpit recipients | PASS | `evidence/mailpit-messages.json` | All 112 messages to `.test` addresses (scanned before export) |
| Signed evidence | PASS | `evidence/engine-log.signed.json` (3,183 requests, run last), `evidence/section-c-engine-log.signed.json` (earlier snapshot incl. the 18 engine events before the Section A resets emptied the outbox) | All 39 ticket request ids verified present in the final signed log |

---

## 4. What Was Not Done (Gaps and Trade-offs)

- **OPS-001 (anyone can become Admin)** is open: fixing it means adding real staff authentication (credentials + signed session), which the spec does not define. Suggested fix is in the ticket.
- **Engine defects** (TW-001…017 except TW-015) are reported, not fixed — closed component. The n8n layer mitigates the ones that matter for email (verification before "confirmed", dedup).
- **Outbox re-delivery**: the leads service now records `delivered`/`failed` per event but has no background job that retries `failed` rows; `tw.mjs redeliver` covers the engine side only.
- **Reconciliation for lost engine events**: handled by fixing the root cause (events URL) and relying on the engine's retry schedule; no scheduled "poll for unhandled payments" workflow was added.
- **Phone normalisation (LS-005)** assumes `0…` and `+234…/+233…` are the same person (test-plan question 4); only Nigerian/Ghanaian prefixes are handled.
- **Seed data** still contains two score-70 leads marked `needs_review` and un-normalised emails; left untouched so Section C evidence stays reproducible.
- **Email templates**: fluid layout without MSO conditionals, so desktop Outlook renders full-width; no unsubscribe page exists to link to (mailto fallback).
- **`tools/tw.mjs export-n8n`** fails on the executions part under n8n 2.42 (`limit=250` > max 100); workflows exported fine, executions exported with `tools/dev/n8n-export-executions.mjs`.
- **Three extra invite emails** went to one `.test` address while reproducing LS-004 (documented in that ticket); the per-address dedup in n8n now prevents it.
