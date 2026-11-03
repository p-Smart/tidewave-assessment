# TW-015: Engine sends all events to n8n's *test* webhook URL — every delivery fails with 404

**Area**: Engine (configuration)  
**Severity**: High  
**Environment**: Starter build  
**Retest Status**: Fixed (configuration changed via admin API, see Notes)  

---

## Summary
The engine setting `n8nEventsUrl` is `http://n8n:5678/webhook-test/solace-events`. n8n's `/webhook-test/` path only listens while a user has the workflow open in the editor and clicks "Listen for test event". In normal operation every `optin.created` / `payment.updated` delivery returns 404, so no intro or confirmation email is ever sent ("events from the engine do not always arrive").

## Steps to Reproduce
1. `curl -H 'Authorization: Bearer tw_staff_viewer_81d4e0' http://localhost:7080/api/staff/settings`
2. Submit any opt-in on `/artist/solace-avenue`.
3. `select id,type,attempts,last_status,delivered_at from engine.outbox;`

## Expected Behavior
`n8nEventsUrl = http://n8n:5678/webhook/solace-events` (production webhook of the published workflow); deliveries return 2xx.

## Actual Behavior
```
{"n8nEventsUrl":"http://n8n:5678/webhook-test/solace-events"}
evt_81a714b6b46600bd3e | optin.created | 3 | 404 | (not delivered)
```
`GET /__tools/evidence` also listed the event with `lastStatus: 404`.

## Evidence
- Request / Response IDs: settings read `req_bc5a70862295c49416`; opt-in `req_082ee6618c1d0e8610`.
- After the fix: `PUT /api/staff/settings {"n8nEventsUrl":"http://n8n:5678/webhook/solace-events"}` (admin) `req_30756d39b25603c931` → outbox `evt_81a714b6b46600bd3e | 200 | delivered`, n8n execution sent exactly one intro email.

## Notes
Retest: Fixed in this environment by configuration. If `/__tools/reset` restores the seed setting, the URL must be set again after every reset — worth making the default correct.
