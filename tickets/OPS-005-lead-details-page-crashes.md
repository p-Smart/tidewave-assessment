# OPS-005: Lead details page crashes for every lead ("Objects are not valid as a React child")

**Area**: Ops Console  
**Severity**: High  
**Environment**: Starter build, ops console (Admin or Viewer)  
**Retest Status**: Fixed (ops-console `leads/[id]/page.tsx` renders `detail` as text; `Activity.detail` typed as object). Verified by the Playwright test, which now passes; it failed on the starter build (`evidence/playwright-strict-starter/`).  

---

## Summary
`ops-console/src/app/leads/[id]/page.tsx` renders `<td>{item.detail}</td>`. `detail` is a JSON object from `leads.lead_activity.detail` (JSONB), e.g. `{score, source, status}`. React throws and Next.js replaces the page with "Application error: a client-side exception has occurred". Every lead has at least an `application_created` activity, so no lead can be viewed — staff cannot see lead details or activity at all.

## Steps to Reproduce
Sign in → Leads → click any row (e.g. Tayo Adeleke, `lead_seed_13`).

## Expected Behavior
Lead details (email, phone, city, score, experience, availability) and the Activity Log table.

## Actual Behavior
Heading `Application error: a client-side exception has occurred while loading localhost`.
Browser: `pageerror: Objects are not valid as a React child (found: object with keys {score, source, status})` — same for `lead_seed_10`.

## Evidence
- Automated test: `playwright/tests/ops/ops-console.spec.ts` "[OPS-005] …" (trace, screenshot).
- Console capture above (Chromium, Viewer session).

## Notes
Fix: render a readable summary of `detail` (key: value pairs) instead of the raw object.
