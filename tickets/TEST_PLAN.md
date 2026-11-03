# Test Plan — Tidewave Music (Section C)

**Scope**: closed engine + public website + FakePay (black box), leads service + ops console + n8n (white box).
**Environment**: starter v1.1 on Docker, engine `localhost:7080`, FakePay `:7090`, leads `:7081`, ops `:7300`, n8n `:7678`, Mailpit `:7025`, Postgres `:7432` as `qa_reader`.
**Oracle**: `docs/PRODUCT_NOTES.md` (PR1–PR14, lead rules), `docs/EMAIL_BRIEFS.md`. A defect is only filed when it is reproduced and backed by an `X-Request-Id`, a SQL row or an automated test. Anything not provable is listed under *Questions*.

## Approach

| Area | Technique | What is checked |
|---|---|---|
| **Payments — pricing** (PR1–PR3, PR5, PR6) | Quote every currency at and around each boundary (`/checkout/quote`), compare with `engine.fx_rates` by hand | Round-UP conversion, XOF has no decimals, 2.5 % fee with ₦100 floor shown separately, ₦1,000 instalment floor, 30-min quote lock |
| **Payments — confirmation** (PR4, PR7, PR14) | Pay with FakePay test cards `4242` (ok), `0002` (declined), `0259` (held processing); visit the return URL genuine and tampered; move the clock (`/__tools/clock`); release held events | Only provider-confirmed backing counts; "You're in" only after confirmation; expired-then-confirmed is still credited |
| **Payments — webhooks** | FakePay dashboard Replay / Release, out-of-order delivery, forged signature, compare engine row vs `GET /v1/payments/{ref}` | Idempotency per event id, provider status wins over event payload, signature enforced |
| **Ledger / levels / refunds** (PR8, PR11, PR13) | Staff API with each token, `engine.ledger` vs `/api/staff/participants` | Totals = credits − reversals, level can go down, only admins refund, history immutable |
| **Referrals** (PR10, PR11) | New friend via `/join?ref=MUSA-7Q`, back, refund | 5 % of backing **excluding fee**, ₦2,000 cap, 7-day hold, cancelled on refund |
| **Privacy / authz** (PR12, PR13) | Persona sessions vs sequential ids, staff tokens, ops console cookie | Own receipts only, admin-only actions, no PII to the wrong party |
| **Receipts / time** (PR9) | Tunde's late-evening backing (23:20 UTC) | Lagos (WAT, UTC+1) on every screen |
| **Leads** | `POST /leads` boundary table (score 49/50/69/70, hours 9.5/10, cities, consent), duplicates (case, whitespace, phone format, consent withdrawn), PATCH with each token, code review of `leads-service/` and PR-17 | Scoring and status rules, 422 on missing fields, never `active/hired/field_ready` |
| **Webhooks to n8n** | Signed/unsigned/replayed events, `/__tools/chaos` 503, Mailpit chaos 451, `/__tools/redeliver`, `automation.message_claims` | Engine events arrive, HMAC verified, exactly one email per action, recovery |
| **Opt-in / email** | Artist page form, Mailpit inbox | Consent unticked by default, correct campaign, only `.test` recipients |

**Data hygiene**: one persona per scenario (Kofi = replays, Musa = expiry/referrals, Ada = return URL), reset only the leads schema between runs so the engine evidence log stays intact. **Evidence**: `X-Request-Id` on every engine call (matches `node tools/tw.mjs evidence`), SQL as `qa_reader`, n8n execution ids, Mailpit list.

## Questions / ambiguities (not filed as defects)

1. **GHS rate age** — the GHS snapshot is dated 15 Aug 2026 but still `is_current`. Is there a maximum age for a rate snapshot (PR1 only says "the snapshot shown on the quote")?
2. **XOF decimal input** — `3922.5` XOF is accepted and silently quoted as `CFA 3,922` (rounded *down*). Should XOF input with decimals be rejected (PR3) or rounded up (PR2 spirit)?
3. **Seeded referral credit on a failed payment** — Musa shows ₦513.45 held for Dayo's `pay_658c551b419ae2a373`, which is `failed`. A live declined payment creates no credit, so this may be seed data only. Should credits be cancelled when a payment later turns failed?
4. **Phone duplicates** — are `08090000101` and `+2348090000101` the same person? Filed as LS-005 assuming yes (Nigerian national vs E.164 format of the same number).
5. **Re-application after consent withdrawn** — rule says it is a new lead; should that person get a new invite email even though they had one before? n8n currently sends at most one invite per address.
6. **Screening link** — `street-team-prospect` points at `/street-team/screening`, which returns 404 on the public site. Is a booking page expected, or should the CTA point elsewhere?
7. **Fee rounding** — PR2 says *converted prices* round up; is the fee also rounded up (engine does: $0.17225 → $0.18)?
8. **Referral for withdrawn/closed campaign** — does the ₦2,000 cap apply per campaign including closed `coastline-ep`?
9. **"You're in" for instalments below Listener** — what should the confirmation page say when the confirmed total is still below ₦2,000?
10. **Checkout currency switch** — on `/checkout` the currency `<select>` has `data-keep="true"`, so changing it relabels the amount field but keeps NGN quick-pick values. Intended?
