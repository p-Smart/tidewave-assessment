# OPS-001: Ops console grants Admin to anyone — role comes from an unauthenticated request / plain cookie

**Area**: Ops Console  
**Severity**: Critical  
**Environment**: Starter build, ops console `localhost:7300`  
**Retest Status**: Open  

---

## Summary
`POST /api/auth/login` (`ops-console/src/app/api/auth/login/route.ts`) sets `staff_role=<role from body>` with no password or identity check, and `getStaffRole()` (`src/lib/serverAuth.ts`) trusts that cookie. Server routes then call the engine/leads with the **admin token**. Anyone who can reach the console can refund payments and read all lead PII as Admin.

## Steps to Reproduce
```bash
curl -i -X POST http://localhost:7300/api/auth/login -H 'Content-Type: application/json' -d '{"role":"Admin"}'
# or simply send the cookie by hand:
curl -i -X POST http://localhost:7300/api/refunds -H 'Cookie: staff_role=Admin' \
  -H 'Content-Type: application/json' -d '{"paymentId":"pay_does_not_exist"}'
```

## Expected Behavior
Login requires credentials; the session cookie is signed/opaque and maps to a server-side identity. Without a valid session: 401/403.

## Actual Behavior
- Login: `200`, `set-cookie: staff_role=Admin; … HttpOnly`.
- Refund with the hand-written cookie passes the console's admin check and reaches the engine **with the admin token**: engine answers `404 payment not found` (only because the id is fake). Without the cookie: `403 Forbidden`.

## Evidence
- Engine `request_log`: `req_6ba407defedd11866f | POST /api/staff/refunds | 404 | staff.admin`.
- A non-existent payment id was used on purpose so nothing was refunded.

## Notes
Fix: real authentication (even a shared staff password + signed session for the assessment), sign the cookie (`iron-session`/JWT) and never take the role from the client. The "Viewer cannot refund" UI rule is otherwise only cosmetic; combined with TW-005, even the engine does not stop a viewer.
