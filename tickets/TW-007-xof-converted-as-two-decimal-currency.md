# TW-007: XOF backing is converted as if XOF had cents — counts 100× too little toward levels

**Area**: Engine  
**Severity**: High  
**Environment**: Starter build, Persona: ada (quote), awa (seed data)  
**Retest Status**: Open  

---

## Summary
**PR3**: XOF has no decimal places (API docs: "XOF has no smaller unit"). Quote display and the minimum check use XOF correctly, but the "Counts as" NGN value and the ledger divide XOF by 100 first. A Supporter-level XOF backing is credited as ₦100.

## Steps to Reproduce
1. Log in as `ada`, `/checkout?campaign=harmattan-sessions`, currency **XOF**, amount **3922** (= the campaign page's Supporter price `CFA 3,922`), tick terms, *Review backing*.
2. Rate in `engine.fx_rates`: XOF `kobo_per_unit = 255` (1 XOF = ₦2.55).
3. Seed check: Awa's one succeeded payment `pay_1c7eeb47489a673db9` is **6,500 XOF**.

## Expected Behavior
- Quote: "Counts as ₦10,001.10" (3922 × 2.55).
- Awa: 6,500 × ₦2.55 = ₦16,575 = **1,657,500 kobo** → level **Supporter**.

## Actual Behavior
- Quote: `Backing CFA 3,922 … Counts as ₦100.01`.
- Awa: ledger `credit 16575` kobo (₦165.75), `confirmedTotalMinor: 16575`, level `''` (no level).

## Evidence
- Request / Response IDs: quote `req_4243311ba082919ce3`.
- SQL:
  ```
  select currency,amount_minor,status from engine.payments where id='pay_1c7eeb47489a673db9'; -- XOF | 6500 | succeeded
  select kobo,source from engine.ledger where payment_id='pay_1c7eeb47489a673db9';         -- 16575 | provider_webhook
  ```
- Controls that are correct: campaign price table `CFA 785 / 3,922 / 19,608` (round-up of 2000/2.55 etc.), minimum `392` rejected / `393` required.

## Notes
16575 = 6500 × 255 / 100: the code treats `amountMinor` as hundredths for every currency. Fix: per-currency minor-unit exponent (XOF 0, others 2). Every XOF backer is under-credited.
