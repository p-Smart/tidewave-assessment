# TW-013: Artist page opt-in has the marketing consent box ticked by default

**Area**: Public Website  
**Severity**: Medium  
**Environment**: Starter build, anonymous visitor  
**Retest Status**: Open  

---

## Summary
Product notes §3 (listener journey on the artist page): "The marketing consent box is unticked by default." On `/artist/solace-avenue` it is pre-ticked, so a visitor who just types name and email is opted in to marketing without an active choice.

## Steps to Reproduce
1. Open `http://localhost:7080/artist/solace-avenue` (no login).
2. Inspect the "Get updates" form.

## Expected Behavior
`<input type="checkbox" name="consent" value="yes">` (unchecked).

## Actual Behavior
`<input type="checkbox" name="consent" value="yes" checked>`. The same form on `/campaigns/harmattan-sessions` is correctly unticked (`id="oc"`).

## Evidence
- `curl -s http://localhost:7080/artist/solace-avenue | grep 'name="consent"'`
- Submitting the form without touching the box (`req_082ee6618c1d0e8610`) produced event `evt_81a714b6b46600bd3e` with `"consent":true` (`engine.outbox`).
- Playwright test in Section A references this ticket.

## Notes
Marketing consent must be an explicit opt-in; the pre-ticked box also makes every intro email in n8n "consented".
