# TW-002: Replayed FakePay `payment.succeeded` webhook credits the same payment again each time

**Area**: Engine  
**Severity**: Critical  
**Environment**: Starter build, Persona: kofi (GHS)  
**Retest Status**: Open  

---

## Summary
FakePay webhooks are not idempotent. Replaying the same signed `payment.succeeded` event (same event id) adds a new ledger credit every time, so one GHS 100 payment was counted four times (₦47,200 instead of ₦11,800). The FakePay dashboard states replays "send the same event (same id)… at any time", so this happens in normal retries too.

## Steps to Reproduce
1. Log in as `kofi`, back Harmattan Sessions **GHS 100** with card `4242 4242 4242 4242`. Do not open the return URL.
2. Wait for the webhook (`fpevt_776e5f1502ea4107f5`, `payment.succeeded`, seq 2).
3. In `http://localhost:7090/dashboard` press **Replay** on that event three times (or `POST /dashboard/events/fpevt_776e5f1502ea4107f5/replay`).
4. Check `engine.ledger` and `/api/staff/participants`.

## Expected Behavior
The second and later deliveries of an already-processed event id are acknowledged (2xx) and ignored. One payment → one credit of 1,180,000 kobo (GHS 100 × ₦118).

## Actual Behavior
Four credits of 1,180,000 kobo for `pay_02aa4592c5c5000041`; Kofi's confirmed total 4,720,000 kobo (₦47,200). One more replay would cross Patron (₦50,000).

## Evidence
- Request / Response IDs: original webhook `req_7a67606c67e866a27d`; replays `req_fafd4159569a80702b`, `req_c1eb64ddb025a31996`, `req_d3e8cb0b5a4d065754` (all 200).
- SQL:
  ```
  select id,event_id,type,sequence from engine.provider_inbox where payment_ref='fp_d08aebc11d8d535a82';
  -- ids 7,8,9,10 all fpevt_776e5f1502ea4107f5 payment.succeeded seq 2 (stored 4 times)
  select kind,kobo,source from engine.ledger where payment_id='pay_02aa4592c5c5000041';
  -- credit 1180000 provider_webhook  x4
  ```
- `/api/staff/participants` → kofi `confirmedTotalMinor: 1180000` after the first delivery, `4720000` after three replays.

## Notes
`provider_inbox` has no unique constraint on `event_id` and the credit is not keyed by payment. Fix: unique `event_id` + "credit once per payment" (e.g. unique ledger row per payment/kind). Out-of-order replay of seq 1 `processing` after `succeeded` was tested and is handled correctly (status stays `succeeded`). Related: TW-003.
