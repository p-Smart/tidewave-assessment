# TW-009: Refunding a friend's backing does not cancel the referrer's held credit

**Area**: Engine  
**Severity**: Medium  
**Environment**: Starter build, Personas: musa (referrer), chidi (new account via `/join?ref=MUSA-7Q`)  
**Retest Status**: Open  

---

## Summary
**PR11**: a refund "cancels referral credit that is still on hold". After an admin refund of the friend's payment, the 7-day held credit stays `held`.

## Steps to Reproduce
1. Open `http://localhost:7080/join?ref=MUSA-7Q`, create `chidi` (NGN). Back ₦10,000 with card 4242 → `pay_0ab60cd71da03d2c71`; Musa gets a held credit.
2. Refund as admin: `POST /api/staff/refunds {"paymentId":"pay_0ab60cd71da03d2c71"}` with `tw_staff_admin_5f2c9a`.
3. `select kobo,status from engine.referral_credits where payment_id='pay_0ab60cd71da03d2c71';`

## Expected Behavior
Credit status `cancelled` (or removed); Musa's held credit goes down.

## Actual Behavior
`51250 | held` after the refund returned `{"ok":true}`.

## Evidence
- Request / Response IDs: signup `req_baf0c2869d03daa830`; refund `req_1459e1fe22ec724700` (200, actor staff.admin).
- SQL output above; `/me/referrals` for Musa still shows `Your credit ₦2,000.00`.

## Notes
The amount 51250 itself is also wrong (TW-010). Release date (+7 days) and the ₦2,000 cap were verified as correct.
