# TW-010: Referral credit is 5% of backing **plus fee** instead of backing only

**Area**: Engine  
**Severity**: Medium  
**Environment**: Starter build, Personas: musa, chidi (via `/join?ref=MUSA-7Q`)  
**Retest Status**: Open  

---

## Summary
**PR10**: "Referral credit is 5% of the friend's confirmed backing (fee excluded)". The engine calculates 5% of the amount *charged* (backing + 2.5% fee).

## Steps to Reproduce
1. Create `chidi` via `http://localhost:7080/join?ref=MUSA-7Q` (currency NGN).
2. Back **₦10,000** (fee ₦250) with card 4242 → `pay_0ab60cd71da03d2c71`.
3. `select kobo from engine.referral_credits where payment_id='pay_0ab60cd71da03d2c71';`

## Expected Behavior
5% × ₦10,000 = ₦500.00 → **50000** kobo.

## Actual Behavior
**51250** kobo = 5% × ₦10,250. Seed credit for Lola (`pay_92837d48a0f454a12e`, ₦10,000 + ₦250 fee) shows the same 51250 on `/me/referrals` as "Lola ₦512.50".

## Evidence
- Request / Response IDs: signup `req_baf0c2869d03daa830`; FakePay webhook for the payment `req_a10612111dc6a24197` / `req_76d6d19e9663ee054d`.
- SQL: `select r.kobo, p.amount_minor, p.fee_minor from engine.referral_credits r join engine.payments p on p.id=r.payment_id;` → `51250 | 1000000 | 25000`.

## Notes
Verified correct in the same run: 7-day hold (`release_at` = payment + 7 d), ₦2,000 cap (second payment credited 46155 to land exactly on 200000), no credit for a declined payment.
