# TW-003: Replaying an old `payment.succeeded` event turns a refunded payment back into succeeded and re-credits it

**Area**: Engine / FakePay integration  
**Severity**: Critical  
**Environment**: Starter build, Persona: ada  
**Retest Status**: Open  

---

## Summary
The engine applies the status written in a FakePay event without checking it against the provider's current state or the payment's own history. After a refund, replaying the original `payment.succeeded` event (a status mismatch: event says succeeded, FakePay says refunded) moves the payment back to `succeeded` and adds a new credit.

## Steps to Reproduce
1. Payment `pay_03ba88bc6984239bfa` (Ada, ₦2,000, card 4242) succeeded via webhook `fpevt_6acdf6ee89e789fa49`.
2. Refund it (`POST /api/staff/refunds {"paymentId":"pay_03ba88bc6984239bfa"}`). Engine: `refunded`, ledger `credit 200000; reversal -200000`. FakePay: `refunded`.
3. In the FakePay dashboard press **Replay** on `fpevt_6acdf6ee89e789fa49`.
4. Check `engine.payments`, `engine.ledger`, FakePay `GET /v1/payments/fp_5670c7a495dea2d284`.

## Expected Behavior
A refunded payment cannot become succeeded again from a replayed/stale event. The engine should confirm with FakePay (`GET /v1/payments/{ref}` — documented on the dashboard) or ignore events older than the current state; no new credit.

## Actual Behavior
`engine.payments.status` = `succeeded`, ledger `credit 200000; reversal -200000; credit 200000`. FakePay still says `refunded`.

## Evidence
- Request / Response IDs: replay delivery `req_859652f8b5f9746a33` (200); refund `req_b8d6992405ed14b3e9`.
- Output:
  ```
  before: refunded  | ledger: credit 200000; reversal -200000
  after:  succeeded | ledger: credit 200000; reversal -200000; credit 200000 | FakePay: "status":"refunded"
  ```
- SQL: `select event_id,type,sequence,received_at from engine.provider_inbox where payment_ref='fp_5670c7a495dea2d284' order by id;`

## Notes
Same root family as TW-002 (no idempotency) but a different failure: state regression / status mismatch. Fix: treat `refunded` as terminal, verify with provider before applying a status, keep a monotonic state machine. Our n8n `solace-events` workflow verifies with `GET /api/automation/payments/{id}` and therefore would not send a second "confirmed" email (that endpoint queries FakePay).
