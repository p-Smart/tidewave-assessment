# LS-003: Staff **Viewer** can change a lead's status (route uses `requireStaff`, not `requireAdmin`)

**Area**: Leads Service  
**Severity**: High  
**Environment**: Starter build  
**Retest Status**: Open  

---

## Summary
The route comment says "staff admin only" and the README says "Staff admin endpoint to update lead status", but `leadsRouter.patch('/:id/status', requireStaff, …)` (`src/routes/leads.ts:246`) allows the read-only viewer token. `requireAdmin` exists in `src/auth.ts` but is never used.

## Steps to Reproduce
Same request as LS-002 with `Authorization: Bearer tw_staff_viewer_81d4e0` and any valid status, e.g. `{"status":"not_now"}`.

## Expected Behavior
`403 Forbidden: Admin credentials required`.

## Actual Behavior
`200`, status changed.

## Evidence
- `PATCH /leads/lead_seed_10/status` with the viewer token → 200 (`updatedAt 2026-11-03T14:10:40.481Z`).
- Activity row `status_changed` is written with `actor 'system'`, so the audit trail does not even show who changed it.
- Automated test: Section A `api` project (references LS-003).

## Notes
Fix: `requireAdmin` on the route and record the real actor (`req.user.role`) in `lead_activity.actor`.
