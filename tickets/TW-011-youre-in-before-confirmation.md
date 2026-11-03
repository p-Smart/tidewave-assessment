# TW-011: "You're in!" is shown for payments that are still processing or were declined

**Area**: Public Website  
**Severity**: High  
**Environment**: Starter build, Persona: ada  
**Retest Status**: Open  

---

## Summary
**PR14**: the "You're in" message appears only after confirmation. The return page shows "You're in! Thank you for backing…" for a payment still `processing` at FakePay (genuine redirect) and for a **declined** payment when the URL says `status=success`.

## Steps to Reproduce
1. Log in as `ada`. Back ₦3,000 and pay with `4000 0000 0000 0259` (processing). FakePay redirects to `/checkout/return?payment=pay_be074f3bb37f4eae9d&status=processing`.
2. Observe the page.
3. Back ₦7,000 and pay with `4000 0000 0000 0002` (declined). Open `/checkout/return?payment=pay_323ffde1bd484499ce&status=success`.

## Expected Behavior
Step 2: "Payment processing — we'll confirm once FakePay does". Step 3: "Payment declined". Never "You're in" unless the payment is confirmed (PR4/PR14).

## Actual Behavior
- Step 2 (genuine redirect, `status=processing`): `You're in! Thank you for backing Harmattan Sessions with ₦3,000. Level unlocked: Listener`.
- Step 3 (declined): `You're in! Thank you for backing Harmattan Sessions with ₦7,000.` — engine row stays `failed`, FakePay `failed`.

## Evidence
- Request / Response IDs: step 2 `req_345b71dbb79a3c2cd9`; step 3 `req_b4c02d4c24fbb03a40`.
- `GET /api/automation/payments/pay_be074f3bb37f4eae9d` at the time → `"status":"processing"`.
- Playwright test in Section A references this ticket.

## Notes
"Level unlocked: Listener" in step 2 is not itself wrong: Ada already had ₦2,000 confirmed at that moment. The defect is the confirmation wording for an unconfirmed payment.

Distinct from TW-001 (which is about crediting). Even when nothing is credited (declined case) the user is told they are in.
