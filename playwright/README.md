# Playwright Suite (Section A)

End-to-end, API and automation tests for the Tidewave stack. Chromium only; traces, screenshots
(and video on failure) are recorded for every test.

## Setup and running

```bash
npm ci
npx playwright install chromium
npx playwright test                       # whole suite (≈ 4 min, 81 tests)
npx playwright test --project=api         # engine, leads service, n8n automation
npx playwright test --project=storefront  # public website + FakePay (browser)
npx playwright test --project=ops         # ops console (needs `npm run dev` in ops-console/, port 7300)
npx playwright test --grep @defect        # only the known-defect reproductions
STRICT_DEFECTS=1 npx playwright test      # make every known defect fail red
npx playwright show-report
```

Slow browser download? `PW_CHANNEL=chrome npx playwright test` (PowerShell: `$env:PW_CHANNEL='chrome'; npx playwright test`).

Leads-service internals that cannot be seen through the API have unit tests in
`leads-service/test/defects.test.ts` (`npm test` there).

## How known defects are handled

Every planted/found defect has a test that asserts the **correct** behaviour and is marked with
`knownDefect('<ticket>')` (title contains `[TICKET] … @defect`).

| Run | Defect tests | Suite |
|---|---|---|
| `npx playwright test` | "expected to fail" (`test.fail`) — shown with ✘ in the list but counted as passed | green, CI passes |
| `STRICT_DEFECTS=1 npx playwright test` | fail red with the defect's actual value | red — proof the starter build has the defect |
| after a fix | Playwright reports **"Expected to fail, but passed"** | red until the marker is removed → no stale markers |

Proof run on the starter build: `evidence/playwright-strict-starter/` (28 failed = exactly the 28 defect
tests, 43 passed). Defects in our own code were then fixed and their tests became `@regression` tests
(they must pass): LS-001…005, LS-007…009, OPS-002…005. Still open (`@defect`): the 15 engine/website
tickets — closed system, cannot be fixed here — and OPS-001 (needs a real staff login: product decision).

| Tag | Count | Meaning |
|---|---|---|
| `@defect` | 16 | open defect, expected to fail (`--grep @defect`) |
| `@regression` | 12 | fixed defect, must pass (`--grep @regression`) |

## Structure

| File | Covers |
|---|---|
| `fixtures.ts` | `resetAll()` (+ re-applies the production n8n events URL, TW-015), persona/staff API helpers, FakePay helpers (pay, replay, release), Mailpit counting, signed n8n events, `knownDefect()` |
| `tests/api/engine.spec.ts` | authorisation (refunds, settings), validation (PR2, PR5, PR6), webhook signature, declined/out-of-order handling; TW-001/002/003/005/006/007/008/010/015/016 |
| `tests/api/leads.spec.ts` | happy path incl. exactly-one invite email + activity, scoring, duplicates, 422s, auth; LS-001…005, 007…009 |
| `tests/api/automation.spec.ts` | n8n: staff test runs (recipient fixed, drafts refused, double submit = one email), signatures, forged payment status, one confirmation despite FakePay replays + engine 503s, no email while processing |
| `tests/storefront/visitor.spec.ts` | preview player, opt-in → exactly one intro email, validation; TW-013 |
| `tests/storefront/persona.spec.ts` | login, `/me`, contributions, wrong password, auth redirect; TW-004, TW-012 |
| `tests/storefront/checkout.spec.ts` | full ₦2,000 backing through FakePay UI → Listener + one confirmation email, declined card, terms required, double-click Pay = one payment; TW-011, TW-017 |
| `tests/storefront/email-templates.spec.ts` | Section D templates rendered at 375px: brief wording present, forbidden wording absent, CTA/unsubscribe/preheader, no overflow, fallbacks, URL guard |
| `tests/ops/messages-test.spec.ts` | Section D `/messages/test`: approved-only dropdown, generated fields (labels, required, placeholders), sandboxed live preview, validation, one email to staff-test on double click, duplicate note, error path |
| `tests/ops/ops-console.spec.ts` | Admin/Viewer sign-in, leads, lead details + activity, payments, viewer has no refund (UI + 403 API), double-click Refund = one request, sign out; OPS-001 (open), OPS-002…005 (regression) |

## Ticket → test map

| Ticket | Test |
|---|---|
| TW-001, 002, 003, 005, 006, 007, 008, 010, 015, 016 | `tests/api/engine.spec.ts` |
| TW-004, TW-012 | `tests/storefront/persona.spec.ts` |
| TW-011, TW-017 | `tests/storefront/checkout.spec.ts` |
| TW-013 | `tests/storefront/visitor.spec.ts` |
| LS-001…005, 007, 008, 009 (fixed) | `tests/api/leads.spec.ts` `@regression` (LS-001 also unit-tested) |
| LS-006, LS-010 (fixed) | `leads-service/test/defects.test.ts` — failed on the starter: `evidence/leads-unit-tests/strict-on-starter.txt` |
| OPS-001 (open), OPS-002…005 (fixed) | `tests/ops/ops-console.spec.ts` |
| TW-009, TW-014 | manual reproduction only (see ticket) |

## Timing sensitivity (why some tests poll)

- **Engine payment row lags FakePay by ~2 s.** `/api/automation/payments/{id}` asks FakePay and says `succeeded` at once; the engine's own row changes when the webhook lands. Refunds before that return 409, so tests wait with `waitForEngineStatus()`.
- **Emails are asynchronous** (engine → n8n → Mailpit, with retries). `settledMailCount()` polls up to 25 s, then waits a 3 s quiet period so a late duplicate would still be counted.
- **Replays/releases**: tests wait 2–4 s after a FakePay dashboard action before reading totals.
- **Shared state**: one worker, files in order, every file starts and ends with `resetAll()` (the engine clock is moved by TW-006).
- **n8n deploys**: right after an n8n restart, the previous workflow version can serve requests for ~10–15 s. Run the suite after n8n has settled.
- No test is retried (`retries: 0`) and none was flaky in the recorded runs.
