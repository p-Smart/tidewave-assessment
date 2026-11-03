# LS-002: `PATCH /leads/:id/status` accepts the forbidden status `active`

**Area**: Leads Service  
**Severity**: High  
**Environment**: Starter build, staff token  
**Retest Status**: Fixed — `allowedStatuses` no longer contains `active` (422). Verified: Playwright `[LS-002] … @regression`. Failed on the starter build: `evidence/playwright-strict-starter/`.  

---

## Summary
Product notes: "The system never marks anyone hired, active or field ready" / "Never `active`, `hired`, `field_ready`". `allowedStatuses` in `leads-service/src/routes/leads.ts:249` includes `'active'`.

## Steps to Reproduce
```bash
curl -X PATCH http://localhost:7081/leads/lead_seed_10/status \
  -H 'Authorization: Bearer tw_staff_viewer_81d4e0' -H 'Content-Type: application/json' -d '{"status":"active"}'
```

## Expected Behavior
`422` — `active` is not a valid lead status.

## Actual Behavior
`200` and the lead is stored with `"status":"active"` plus a `status_changed` activity `{from: not_now, to: active}`.

## Evidence
- Response: `{"id":"lead_seed_10",…,"status":"active","updatedAt":"2026-11-03T14:10:40.481Z"}`
- `select status from leads.leads where id='lead_seed_10';` → `active` (until `/__tools/reset`).
- Automated test: Section A `api` project (references LS-002).

## Notes
Fix: remove `active` from `allowedStatuses`; ideally a shared enum for valid statuses. Same request also shows LS-003 (viewer allowed).
