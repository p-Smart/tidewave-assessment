# TW-017: Every checkout validation error is shown as "Network problem. Please check your connection"

**Area**: Public Website  
**Severity**: Medium  
**Environment**: Starter build, Persona: ada  
**Retest Status**: Open  

---

## Summary
`POST /checkout/quote` redirects back with the same misleading message for every validation failure: amount below the ₦1,000 minimum, amount 0, non-numeric amount, terms not ticked, closed campaign. The user is told their connection failed and is never told the minimum (PR6) or that the terms must be accepted. The opt-in form shows proper messages, so this is specific to checkout.

## Steps to Reproduce
1. Log in as `ada`, open `/checkout?campaign=harmattan-sessions`.
2. Enter `999.99` NGN, tick the terms, press *Review backing*. Repeat with `0`, `abc`, terms unticked, and `campaign=coastline-ep`.

## Expected Behavior
Specific messages, e.g. "The minimum is ₦1,000 (or equivalent)", "Please confirm you understand backing is voluntary", "This campaign has closed".

## Actual Behavior
Always `/checkout?…&error=Network+problem.+Please+check+your+connection+and+try+again.` rendered as `<p class="err" role="alert">Network problem. Please check your connection and try again.</p>`.

## Evidence
- Request / Response IDs: below minimum `req_25f3b8096fb63704cf`; amount 0 `req_e225a835d8a6a333fb`; terms missing `req_7bcd3c444c1e3ae2f4`; closed campaign `req_b47afa2ddb7df837a0` (all 303 with the same error text).
- Automated test: `playwright/tests/storefront/checkout.spec.ts` "[TW-017] …".
