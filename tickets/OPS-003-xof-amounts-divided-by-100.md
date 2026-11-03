# OPS-003: Payments page shows XOF amounts divided by 100 ("65.00 XOF" for CFA 6,500)

**Area**: Ops Console  
**Severity**: Medium  
**Environment**: Starter build, ops console  
**Retest Status**: Fixed — `formatMoney` uses the currency's minor-unit digits (XOF 0). Verified: Playwright `[OPS-003] … @regression`. Failed on the starter build: `evidence/playwright-strict-starter/`.  

---

## Summary
`ops-console/src/lib/formatMoney.ts` always does `amountMinor / 100` with two decimals. XOF has no minor unit (PR3, engine docs), so staff see Awa's CFA 6,500 backing as 65.00 XOF and a fee of 1.63 XOF (real: 163).

## Steps to Reproduce
Sign in to the ops console → Payments → row `par_awa_617761`.

## Expected Behavior
`6,500 XOF` (or `CFA 6,500`), fee `163 XOF`.

## Actual Behavior
`par_awa_617761 harmattan-sessions 65.00 XOF 1.63 XOF succeeded …`

## Evidence
- Automated test: `playwright/tests/ops/ops-console.spec.ts` "[OPS-003] …" — received row text above.
- Engine `GET /api/staff/payments`: `{"amountMinor":6500,"currency":"XOF","feeMinor":163,…}`.

## Notes
Fix: use `Intl.NumberFormat(locale, { style: 'currency', currency })`, which knows XOF has 0 fraction digits. Same root idea as engine TW-007, but this one is in our code.
