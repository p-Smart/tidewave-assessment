# LS-006: `lead.created` is sent before the lead is saved, fire-and-forget, with no retry

**Area**: Leads Service  
**Severity**: High  
**Environment**: Starter build  
**Retest Status**: Open  

---

## Summary
`POST /leads` calls `sendLeadCreatedEvent(...)` (`src/routes/leads.ts:109`) **before** the `INSERT` (`:121`), without `await`, and ignores the result. Consequences: (a) n8n can receive an event for a lead that never gets saved; (b) n8n can fetch the lead before the insert commits (race); (c) if n8n is down the event is lost — `leads.event_outbox` exists but is never used.

## Steps to Reproduce
Make the insert fail after validation passes — `first_name` is `VARCHAR(100)` but zod has no max:
```bash
curl -X POST http://localhost:7081/leads -H 'Content-Type: application/json' \
  -d "{\"firstName\":\"$(python3 -c 'print("A"*101)')\",\"email\":\"long.name@mail.test\",\"phone\":\"+2348000000888\",\"city\":\"Lagos\",\"experienceYears\":3,\"hoursPerWeek\":25,\"consent\":true}"
```

## Expected Behavior
No event for an application that was not stored (and a 422 for the too-long name — LS-009).

## Actual Behavior
- API: `500 {"error":"Internal server error"}`; log: `error: value too long for type character varying(100)`.
- n8n still received `lead.created` for `lead_1793715255052_1c20a`; *Get Lead* retried 5× (4.2 s) and the workflow answered 503. That lead id does not exist in `leads.leads`.

## Evidence
- n8n execution 73 (`street-team-lead`): Verify Signature → event `leadId: lead_1793715255052_1c20a`; `Get Lead` failed after retries; `Respond Lead Fetch Failed`.
- `select count(*) from leads.leads where id='lead_1793715255052_1c20a';` → 0.
- `docker compose logs leads` shows the insert error.

## Notes
Fix: insert lead + outbox row in one transaction (`withTransaction` exists in `db.ts`), deliver from the outbox with retries, mark delivered. The n8n workflow already retries `Get Lead` 5× to survive the race.
