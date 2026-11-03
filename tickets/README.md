# Section C — Tickets, code review and test plan

- [`TEST_PLAN.md`](TEST_PLAN.md) — approach and open questions about business rules.
- [`PR-17-REVIEW.md`](PR-17-REVIEW.md) — review of the open pull request (request changes).
- Tickets below follow `docs/TICKET_TEMPLATE.md`. Every ticket has reproduction steps and runtime evidence (`X-Request-Id` from the engine, which also appear in `evidence/engine-log.signed.json`, SQL as `qa_reader`, n8n execution ids or Mailpit). Request ids starting `req_` are engine ids.

## Closed system (engine / website / FakePay)

| ID | Severity | Rule | Title |
|---|---|---|---|
| [TW-001](TW-001-return-url-credits-unconfirmed-payment.md) | Critical | PR4 | Return URL `status=success` marks a processing payment succeeded and credits it |
| [TW-002](TW-002-fakepay-replay-double-credits.md) | Critical | PR4 | Replayed FakePay webhook credits the same payment again each time |
| [TW-003](TW-003-stale-webhook-resurrects-refunded-payment.md) | Critical | PR4/PR11 | Stale `payment.succeeded` replay turns a refunded payment back to succeeded |
| [TW-004](TW-004-receipts-idor.md) | Critical | PR12 | Any participant can read every other participant's receipt |
| [TW-005](TW-005-viewer-can-refund.md) | High | PR13 | Staff viewer token can refund |
| [TW-006](TW-006-late-confirmation-after-expiry-not-credited.md) | High | PR7 | Late confirmation after expiry is never credited |
| [TW-007](TW-007-xof-converted-as-two-decimal-currency.md) | High | PR3 | XOF converted as if it had cents (100× too little) |
| [TW-008](TW-008-confirmed-total-ignores-refunds.md) | High | PR11 | Confirmed total / level ignore refunds |
| [TW-011](TW-011-youre-in-before-confirmation.md) | High | PR14 | "You're in!" shown for processing / declined payments |
| [TW-015](TW-015-engine-events-sent-to-n8n-test-url.md) | High | — | Engine events sent to n8n *test* URL (all 404) — fixed by config |
| [TW-009](TW-009-refund-keeps-referral-credit.md) | Medium | PR11 | Refund does not cancel held referral credit |
| [TW-010](TW-010-referral-credit-includes-fee.md) | Medium | PR10 | Referral credit includes the fee |
| [TW-012](TW-012-receipt-shows-utc-not-lagos-time.md) | Medium | PR9 | Receipt shows UTC, not Lagos time |
| [TW-013](TW-013-optin-consent-pre-ticked.md) | Medium | §3 | Artist-page opt-in consent is pre-ticked |
| [TW-014](TW-014-artist-optin-tagged-with-closed-campaign.md) | Medium | §3 | Artist-page opt-ins tagged with closed campaign `coastline-ep` |

## Open components

| ID | Severity | Area | Title |
|---|---|---|---|
| [OPS-001](OPS-001-anyone-can-sign-in-as-admin.md) | Critical | Ops console | Anyone can become Admin (role from request body / plain cookie) |
| [LS-001](LS-001-score-70-not-screening-invite.md) | High | Leads | Score exactly 70 → `needs_review` (`>` instead of `>=`) |
| [LS-002](LS-002-status-can-be-set-to-active.md) | High | Leads | PATCH accepts forbidden status `active` |
| [LS-003](LS-003-viewer-can-change-lead-status.md) | High | Leads | Viewer can change lead status |
| [LS-004](LS-004-duplicate-check-case-sensitive.md) | High | Leads | Duplicate check is case-sensitive → repeat invites |
| [LS-006](LS-006-event-sent-before-insert.md) | High | Leads | Event sent before insert, fire-and-forget, no retry |
| [LS-005](LS-005-phone-formats-not-normalised.md) | Medium | Leads | Phone formats not normalised for duplicates |
| [LS-007](LS-007-missing-template-variable-renders-undefined.md) | Medium | Leads | Missing template variable renders "undefined" |
| [LS-010](LS-010-migrations-rerun-and-startup-ignores-failure.md) | Medium | Leads | Migrations re-run every boot; startup ignores failure |
| [LS-008](LS-008-negative-numbers-accepted.md) | Low | Leads | Negative / non-numeric hours and years accepted |
| [LS-009](LS-009-overlong-fields-return-500.md) | Low | Leads | Over-long fields return 500 instead of 422 |

## Verified as working (no ticket)
Price table round-up in USD/GHS/XOF; ₦1,000 instalment floor and its currency equivalents; 2.5 % fee with ₦100 floor shown separately; ledger credits exclude the fee; quote lock 30 min shown in Lagos time; FakePay signature enforced (`req_eeff14d36bfa5a07f1` → 400); out-of-order `processing` after `succeeded` does not downgrade; declined payment is not credited; referral 7-day hold and ₦2,000 cap; no referral credit for a declined payment; refunds refused for automation/anonymous/participant callers; settings API admin-only.
