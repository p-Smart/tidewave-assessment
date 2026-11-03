# TW-001: Return URL `status=success` marks a processing payment as succeeded and credits the backing

**Area**: Engine / Public Website  
**Severity**: Critical  
**Environment**: Starter build, Persona: ada  
**Retest Status**: Open  

---

## Summary
`GET /checkout/return?payment=<id>&status=success` is trusted by the engine. When the payment is still `processing` at FakePay, visiting this URL with `status=success` (a value the browser controls) sets the payment to `succeeded` and writes a ledger credit with `source = return_url`. The participant's confirmed total and level go up although FakePay never confirmed the money. Violates **PR4** ("counts toward a level only when FakePay confirms it").

## Steps to Reproduce
1. Log in as `ada` / `listen123`.
2. Back Harmattan Sessions ₦1,500 (NGN) and pay on FakePay with card `4000 0000 0000 0259` (stays processing).
3. FakePay redirects to `/checkout/return?payment=pay_c1ae199d2053baed83&status=processing`. Do **not** release the event in the FakePay dashboard.
4. Open `http://localhost:7080/checkout/return?payment=pay_c1ae199d2053baed83&status=success`.
5. Query `engine.payments` / `engine.ledger` and FakePay `GET /v1/payments/fp_05c541a847d8326c18`.

## Expected Behavior
The payment stays `processing`, no ledger credit, confirmed total unchanged until FakePay sends a signed `payment.succeeded` (PR4). The return URL is only a UI hint.

## Actual Behavior
The payment becomes `succeeded`, the ledger gets `credit 150000 source=return_url`, and Ada's confirmed total goes from 500000 to 650000 kobo. FakePay still reports `processing`, and the engine's own verified API (`/api/automation/payments/…`) also says `processing`.

## Evidence
- Request / Response IDs: forged return `req_d800efd0d34dd1349c`; payment `pay_c1ae199d2053baed83`, FakePay ref `fp_05c541a847d8326c18`. Same effect earlier on `pay_be074f3bb37f4eae9d` (`req_1c9f985caad549c6d0`).
- Before / after (qa_reader):
  ```
  before: processing | ledger rows: 0              | confirmedTotalMinor 500000
  after:  succeeded  | credit 150000 return_url     | confirmedTotalMinor 650000
  FakePay GET /v1/payments/fp_05c541a847d8326c18 -> {"status":"processing","amountMinor":160000,...}
  GET /api/automation/payments/pay_c1ae199d2053baed83 -> "status":"processing","verifiedWithProvider":true
  ```
- Control: the genuine return URL (`status=processing`, `req_63e9db011c5f8c19ca`) did **not** credit; a forged `status=success` on an already-**failed** payment (`req_b4c02d4c24fbb03a40`) did not credit either — only non-final payments are affected.
- SQL: `select kind,kobo,source from engine.ledger where payment_id='pay_c1ae199d2053baed83';`

## Notes
Root-cause hypothesis: the return handler treats the `status` query parameter as a confirmation for non-terminal payments and calls the same "credit" path as the webhook. Fix: never change payment state from the return URL; show "processing" and poll. Any user can inflate their level for free. Related: TW-011 (message shown), TW-003 (event payload trusted over provider).
