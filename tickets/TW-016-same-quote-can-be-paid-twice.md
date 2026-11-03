# TW-016: One quote can be paid several times — a repeated "Pay with FakePay" request charges again

**Area**: Engine  
**Severity**: High  
**Environment**: Starter build, Persona: bayo  
**Retest Status**: Open  

---

## Summary
Every `POST /checkout/pay` with the same `quote` creates a new engine payment and a new FakePay session. Both can be paid and both are credited, so a double submit (retry after a slow network, two tabs, a replayed form post) charges the backer twice.

## Steps to Reproduce
1. Log in as `bayo`, create a quote for ₦1,000 (`quo_01dfe1ca224fc8c138`).
2. Send `POST /checkout/pay quote=quo_01dfe1ca224fc8c138` twice.
3. Pay both FakePay sessions with card 4242.

## Expected Behavior
The second request returns the existing FakePay session (or an error); one quote → at most one payment.

## Actual Behavior
```
pay #1 -> 303 http://localhost:7090/pay/fp_8f210bc016e3ef7779   req_756b24a9be94dfe5d2
pay #2 -> 303 http://localhost:7090/pay/fp_8ef8a6de6e849afcb6   req_ef8654543d8e7609c7
engine.payments where quote_id='quo_01dfe1ca224fc8c138':
  pay_6940cd9b04f6549feb | succeeded | 100000 | credit 100000
  pay_b0e5a78266737f39dc | succeeded | 100000 | credit 100000
```

## Evidence
- Request / Response IDs above; SQL as `qa_reader` above.
- Automated test: `playwright/tests/api/engine.spec.ts` "[TW-016] paying the same quote twice (double submit) charges only once".
- Note: a double-click in the browser sends only one POST (the browser cancels the second submit) — covered by `tests/storefront/checkout.spec.ts` and passing. The server itself is not idempotent per quote.

## Notes
Fix: unique `payments.quote_id` (one active payment per quote) and return the existing session on repeat.
