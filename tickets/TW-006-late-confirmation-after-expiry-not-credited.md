# TW-006: Payment confirmed by FakePay after it expired is never credited (money taken, no backing)

**Area**: Engine  
**Severity**: High  
**Environment**: Starter build, Persona: musa  
**Retest Status**: Open  

---

## Summary
**PR7**: "A pending payment expires after 30 minutes. If FakePay later confirms an expired payment, it must still be credited, because the money was taken." The engine accepts the late `payment.succeeded` webhook (200) but leaves the payment `expired` and writes no ledger credit.

## Steps to Reproduce
1. Log in as `musa`, back **₦10,000** NGN, pay with card `4000 0000 0000 0259` (held processing). Payment `pay_5cda0859b7efbb3804`, FakePay `fp_33200d75f93141ab7a`.
2. `node tools/tw.mjs clock 40` (engine time +40 min) → engine status `expired`.
3. FakePay dashboard → **Release** the held `payment.succeeded` event `fpevt_500555e0d7207a6751`.
4. Check engine payment, ledger, FakePay status, Musa's total.

## Expected Behavior
Payment becomes `succeeded` (or `succeeded_late`), ledger credit 1,000,000 kobo, Musa reaches Supporter.

## Actual Behavior
```
after +40 min:  expired
after release:  engine=expired | FakePay="status":"succeeded" | ledger: (none)
musa confirmedTotalMinor 0, level ''
```
FakePay charged ₦10,250.

## Evidence
- Request / Response IDs: clock `req_55f5f81bf7ec282456`; late webhook `req_1ba9127af70419fe5c` (200, actor fakepay).
- SQL: `select status from engine.payments where id='pay_5cda0859b7efbb3804';` → `expired`; `select * from engine.ledger where payment_id='pay_5cda0859b7efbb3804';` → 0 rows. `provider_inbox` id 14 shows the event was received.

## Notes
Hypothesis: the webhook handler only transitions from `processing`/`pending` and silently ignores `expired`. Customer impact: money taken without backing or receipt.
