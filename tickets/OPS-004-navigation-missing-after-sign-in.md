# OPS-004: After signing in, the navigation bar still shows "Sign in" — no Leads/Payments/Test Messages links, role or Sign out until a reload

**Area**: Ops Console  
**Severity**: Medium  
**Environment**: Starter build, ops console  
**Retest Status**: Fixed — `Navigation` re-reads the role on every route change (`usePathname`). Verified: Playwright `[OPS-004] … @regression` (no reload). Failed on the starter build: `evidence/playwright-strict-starter/`.  

---

## Summary
`Navigation.tsx` fetches `/api/auth/me` once in `useEffect(…, [])`. The navigation lives in the root layout, which is not re-mounted when the login page does `router.push('/leads')`, so the role stays `null`. A non-technical colleague cannot reach Payments or Test Messages, or sign out, without knowing to refresh. The same happens in reverse after Sign out.

## Steps to Reproduce
1. Open `http://localhost:7300/login`, click *Sign in as Admin*.
2. Look at the navigation bar on `/leads`.

## Expected Behavior
`Leads · Payments · Test Messages · Role: Admin · Sign out`.

## Actual Behavior
Only `Tidewave Ops Console` and `Sign in` (accessibility snapshot in the test's `error-context.md`). After a manual reload the links appear.

## Evidence
- Automated test: `playwright/tests/ops/ops-console.spec.ts` "[OPS-004] …"; trace and screenshot in `test-results/`.

## Notes
Fix: re-fetch the role on route change (`usePathname()` dependency) or render the nav from a server component that reads the cookie. The other ops tests reload once after login to work around this.
