# TW-008: Confirmed total and level ignore refunds (refunded backer keeps Supporter)

**Area**: Engine  
**Severity**: High  
**Environment**: Starter build, Persona: zara (seed), ada  
**Retest Status**: Open  

---

## Summary
**PR11**: "A refund removes the backing from the total (the level can go down)". The engine writes a `reversal` row in the ledger on refund, but the confirmed total shown to staff, the participant and automation only sums credits.

## Steps to Reproduce
1. No action needed — seed persona `zara` "had a refund".
2. `GET /api/staff/participants` (viewer token) and `select kind,kobo,source from engine.ledger where participant_id='par_zara_7a6172';`
3. Optional live repro: refund any succeeded payment (`POST /api/staff/refunds`, admin token) and re-read the participant.

## Expected Behavior
Zara: total 0, no level. Ada after refunding `pay_03ba88bc6984239bfa`: total drops by 200,000.

## Actual Behavior
```
ledger zara: credit 1200000 provider_webhook ; reversal -1200000 staff_refund
participants zara: confirmedTotalMinor 1200000, level 'Supporter'
ledger ada:  credit 200000 ; credit 300000 ; credit 150000 ; reversal -200000 (refund)
participants ada: confirmedTotalMinor 650000 (unchanged after refund)
```

## Evidence
- Request / Response IDs: refund `req_b8d6992405ed14b3e9`; participants read via `GET /api/staff/participants`.
- Zara's payment `pay_c84d10b81c37e1cf75` is `refunded` both in the engine and in FakePay.

## Notes
Fix: total = Σ credits + Σ reversals (or exclude refunded payments). Ada's 300000/150000 credits are themselves wrong (TW-001); this ticket is only about the ignored reversal.
