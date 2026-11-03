# LS-001: Applicant with score exactly 70 gets `needs_review` instead of `screening_invite`

**Area**: Leads Service  
**Severity**: High  
**Environment**: Starter build, public `POST /leads`  
**Retest Status**: Open  

---

## Summary
Rule: score **≥ 70** → `screening_invite`. `determineStatus` uses `score > 70` (`leads-service/src/scoring.ts:44`), so every applicant on the boundary is down-graded and never gets the screening email.

## Steps to Reproduce
```bash
curl -X POST http://localhost:7081/leads -H 'Content-Type: application/json' -d '{"firstName":"Bola","email":"bola.seventy@mail.test","phone":"+2348000000701","city":"Lagos","experienceYears":3,"hoursPerWeek":5,"consent":true}'
```
Score: 3 y = 40, 5 h = 0, Lagos = 30 → **70**.

## Expected Behavior
`{"status":"screening_invite"}`

## Actual Behavior
`{"id":"lead_1793715040387_l4sjg","status":"needs_review","duplicateOf":null}` (201)

## Evidence
- Response above; lead `lead_1793715040387_l4sjg` in `leads.leads` with `score 70, status needs_review`.
- Code: `if (score > 70) { return 'screening_invite'; }`
- Unit tests in `leads-service/test/scoring.test.ts` only use 85/60/40, never the boundary. Seed rows `lead_seed_04`/`lead_seed_05` (score 70, `needs_review`) carry the same error.
- Automated test: Section A `api` project (references LS-001).

## Notes
Fix: `score >= 70`; add boundary tests 49/50/69/70.
