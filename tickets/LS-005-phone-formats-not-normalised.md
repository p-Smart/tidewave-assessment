# LS-005: Same phone number in national vs international format is not recognised as a duplicate

**Area**: Leads Service  
**Severity**: Medium  
**Environment**: Starter build  
**Retest Status**: Open  

---

## Summary
The duplicate check compares `phone` as raw text. `08090000101` and `+2348090000101` are the same Nigerian number but produce two independent leads. Seed data: Femi Okafor `lead_seed_03` (`+2348031234567`) and `lead_seed_04` (`08031234567`) — not linked.

## Steps to Reproduce
1. Existing lead with phone `+2348090000101` (`lead_1793713610462_1lz5o`).
2. `POST /leads` with `"phone":"08090000101"`, another email (`ngozi.other@mail.test`).

## Expected Behavior
`status: duplicate`, `duplicateOf: lead_1793713610462_1lz5o`.

## Actual Behavior
`{"id":"lead_1793715040426_djaaj","status":"screening_invite","duplicateOf":null}` — and n8n sent a street-team invite to the second address.

## Evidence
- Response above; Mailpit `ngozi.other@mail.test | Tidewave Street Team - Next Steps` (14:10:41).
- Automated test: Section A `api` project (references LS-005).

## Notes
Depends on the business answer to TEST_PLAN question 4 (same person?). Fix: normalise to E.164 on write (e.g. `libphonenumber`), compare normalised values.
