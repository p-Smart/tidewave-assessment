# LS-009: Over-long text fields return 500 instead of a 422 validation error

**Area**: Leads Service  
**Severity**: Low  
**Environment**: Starter build  
**Retest Status**: Open  

---

## Summary
DB columns are `VARCHAR(100)` (`first_name`, `last_name`, `city`), `VARCHAR(50)` (`phone`), `VARCHAR(255)` (`email`), but the zod schema has no `.max()`. The applicant gets a generic 500.

## Steps to Reproduce
See LS-006 (101-character `firstName`).

## Expected Behavior
`422 {"errors":[{"field":"firstName","message":"…at most 100 characters"}]}`

## Actual Behavior
`500 {"error":"Internal server error"}`, log `value too long for type character varying(100)`.

## Evidence
- Same request as LS-006; leads container log.
- Automated test: Section A `api` project (references LS-009).
