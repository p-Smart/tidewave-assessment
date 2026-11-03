# OPS-002: Lead search only filters the 20 rows already on screen

**Area**: Ops Console  
**Severity**: Medium  
**Environment**: Starter build, ops console (Viewer or Admin)  
**Retest Status**: Fixed — leads page sends a debounced `search` to the server and resets to page 1. Verified: Playwright `[OPS-002] … @regression`. Failed on the starter build: `evidence/playwright-strict-starter/`.  

---

## Summary
`ops-console/src/app/leads/page.tsx` loads one page (`/api/leads?page=&pageSize=20`) and filters it in the browser (`filteredLeads`). The leads service already supports `?search=` across all rows, but the console never sends it. Any lead not on the current page is "not found".

## Steps to Reproduce
1. Have more than 20 leads (seed 14 + 21 new applications; newest first, so the seed leads move to page 2).
2. Sign in, type `Kemi` in "Search leads by name, email, or city...".

## Expected Behavior
Kemi Adeyemi's leads are listed (server-side search).

## Actual Behavior
"No leads found." while the pager still says "Page 1 of 2".

## Evidence
- Automated test: `playwright/tests/ops/ops-console.spec.ts` "[OPS-002] …" (screenshot + trace in `test-results/`).
- `GET http://localhost:7081/leads?search=Kemi` (staff token) returns the rows — the API works.

## Notes
Fix: pass `search` to `/api/leads` and the leads service, reset to page 1 on new search, debounce input.
