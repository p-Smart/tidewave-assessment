# LS-008: Negative or non-numeric experience/hours are accepted and silently scored as 0

**Area**: Leads Service  
**Severity**: Low  
**Environment**: Starter build  
**Retest Status**: Fixed — `experienceYears` 0–80, `hoursPerWeek` 0–168, numeric strings coerced, non-numeric → 422. Verified: Playwright `[LS-008] … @regression`. Failed on the starter build: `evidence/playwright-strict-starter/`.  

---

## Summary
`experienceYears` / `hoursPerWeek` are `z.union([z.number(), z.string()])` without range or numeric checks; `calculateScore` turns anything non-numeric into 0. Bad input is stored instead of rejected with 422.

## Steps to Reproduce
`POST /leads` with `"experienceYears":-5,"hoursPerWeek":-40` (all other fields valid).

## Expected Behavior
`422` with field errors (e.g. `experienceYears must be ≥ 0`, `hoursPerWeek must be between 0 and 168`).

## Actual Behavior
`201 {"id":"lead_1793715040448_9jp3z","status":"not_now"}` — stored with `experience_years -5`, `hours_per_week -40`.

## Evidence
- Response above; `select experience_years,hours_per_week from leads.leads where id='lead_1793715040448_9jp3z';`
- Automated test: Section A `api` project (references LS-008).
