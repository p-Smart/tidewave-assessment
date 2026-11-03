# TW-004: Any signed-in participant can open every other participant's receipt (name, email, amount)

**Area**: Public Website / Engine  
**Severity**: Critical  
**Environment**: Starter build, Persona: tunde  
**Retest Status**: Open  

---

## Summary
`/me/receipts/{receiptNo}` does not check ownership. Receipt numbers are sequential (1001, 1002, …), so any participant can enumerate all receipts and read other backers' full name, email address, amount and payment reference. Violates **PR12** and exposes personal data.

## Steps to Reproduce
1. Log in as `tunde` / `listen123`. `/me/contributions` lists only receipt **#1003**.
2. Open `http://localhost:7080/me/receipts/1001`, then `/1005`, `/1007`.

## Expected Behavior
403/404 for receipts that do not belong to the signed-in participant (PR12).

## Actual Behavior
HTTP 200 with the other person's receipt:
```
#1001 Backer Bayo Adeleke bayo.adeleke@example.test
#1005 Backer Lola Peters  lola.peters@example.test
#1007 Backer Ada Obi      ada.obi@example.test
```

## Evidence
- Request / Response IDs: `req_f836d0433329043e17` (#1001), `req_94d94bbe9d51919f70` (#1005), `req_c91509b91d32fb9523` (#1007), `req_4f5898626ead171761` (#1010), own receipt `req_5f06d5fbb55db60786`.
- Control: unauthenticated request → 303 to `/login?next=/me/receipts/1003` (authentication works, authorisation does not).

## Notes
Fix: look up receipts by `(receiptNo, participant_id = session.participant)`; consider non-guessable ids. Automated test: `playwright/tests/storefront/` (Section A) references this ticket.
