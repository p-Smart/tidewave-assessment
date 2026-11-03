# TW-014: Opt-ins from the Solace Avenue artist page are tagged with the closed campaign `coastline-ep`

**Area**: Engine / Public Website  
**Severity**: Medium  
**Environment**: Starter build, anonymous visitor  
**Retest Status**: Open  

---

## Summary
The listener journey (product notes §3) leads from the artist page opt-in to "an intro email containing a direct link to the campaign page" of the active campaign (Harmattan Sessions). The engine stores and emits these opt-ins with `campaignSlug: "coastline-ep"`, which is `is_open = false` and shows "This campaign has closed."

## Steps to Reproduce
1. `curl -X POST http://localhost:7080/optin -d 'first_name=Probe&email=probe.optin@example.test&consent=yes'` (the artist page form).
2. `select campaign_slug, source from engine.optins;` and `select payload from engine.outbox where type='optin.created';`

## Expected Behavior
`campaign_slug = harmattan-sessions` (the only open campaign of the artist).

## Actual Behavior
```
optins: opt_24acdd271df8e28ec5 | Probe | probe.optin@example.test | solace-avenue | coastline-ep | Artist | t
outbox: {"data":{"artistSlug":"solace-avenue","campaignSlug":"coastline-ep","consent":true,...,"source":"Artist"},"id":"evt_81a714b6b46600bd3e","type":"optin.created"}
```

## Evidence
- Request / Response IDs: opt-in `req_082ee6618c1d0e8610`; event `evt_81a714b6b46600bd3e`.
- `select slug,is_open from engine.campaigns;` → `coastline-ep | f`, `harmattan-sessions | t`.

## Notes
The starter n8n workflow built the email link from `campaignSlug`, so listeners would have been sent to a closed campaign. The fixed workflow pins the link to the active campaign until this is fixed. Also note `source` is `"Artist"` (capitalised) while the starter workflow compared against `"artist"`.
