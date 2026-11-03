# TW-012: Receipt shows UTC time instead of Lagos time (WAT) — late-evening backing gets the wrong date

**Area**: Public Website  
**Severity**: Medium  
**Environment**: Starter build, Persona: tunde  
**Retest Status**: Open  

---

## Summary
**PR9**: receipts show Lagos date and time (WAT, UTC+1). Tunde's backing at 23:20 UTC (= 00:20 WAT next day) shows the UTC time and the previous date on the receipt, while the contributions list shows the Lagos date — the two pages disagree.

## Steps to Reproduce
1. Log in as `tunde` / `listen123`.
2. Open `/me/contributions` → row `30 Oct 2026 … #1003`.
3. Open `/me/receipts/1003`.

## Expected Behavior
`Date 30 Oct 2026, 00:20` (WAT).

## Actual Behavior
`Date 29 Oct 2026, 23:20`.

## Evidence
- Request / Response IDs: receipt `req_78b81054d58f14a2a6`.
- SQL: `select created_at from engine.payments where id='pay_f9dd800e205fb74384';` → `2026-10-29 23:20:00+00`.
- The engine container runs with `TZ: UTC` (docker-compose), consistent with formatting in server local time.

## Notes
Fix: format receipt timestamps with `Africa/Lagos`. Quote expiry ("valid until 15:34 (Lagos)") is already correct, so only the receipt is affected.
