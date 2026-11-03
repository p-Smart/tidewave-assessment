# TW-005: Staff Viewer token can refund payments

**Area**: Engine (staff API)  
**Severity**: High  
**Environment**: Starter build, token `STAFF_VIEWER_TOKEN`  
**Retest Status**: Open  

---

## Summary
`POST /api/staff/refunds` accepts the **viewer** token. The API docs and **PR13** say only admins can refund. The engine itself records the actor as `staff.viewer`, so it knows the caller is not an admin.

## Steps to Reproduce
```bash
curl -i -X POST http://localhost:7080/api/staff/refunds \
  -H 'Authorization: Bearer tw_staff_viewer_81d4e0' -H 'Content-Type: application/json' \
  -d '{"paymentId":"pay_03ba88bc6984239bfa"}'
```

## Expected Behavior
`403 {"error":"only admins can refund"}` — as already returned for automation, anonymous and participant callers.

## Actual Behavior
`200 {"ok":true}`; the payment is refunded at FakePay and in the engine.

## Evidence
- Request / Response IDs: viewer `req_b8d6992405ed14b3e9` → 200; automation `req_b86d37e24817276158` → 403; anonymous `req_f366a931bd6b0770ee` → 403; participant ada `req_a5f9b030699e5ada88` → 403.
- `engine.request_log`: `req_b8d6992405ed14b3e9 | POST | /api/staff/refunds | 200 | staff.viewer`
- `engine.ledger`: `pay_03ba88bc6984239bfa | reversal | -200000 | refund:staff.viewer`
- FakePay `GET /v1/payments/fp_5670c7a495dea2d284` → `"status":"refunded"`.
- Control: `PUT /api/staff/settings` with the viewer token → 403 `admin only` (`req_2937011e2778f64d09`), so the admin check exists elsewhere but is missing on refunds.

## Notes
The ops console hides the Refund action from viewers in its own API route, but the engine must enforce it (defence in depth). See also OPS-001: anyone can obtain an Admin session in the ops console.
