# LS-010: Every migration file re-runs on every start, and the service starts even if migrations fail

**Area**: Leads Service  
**Severity**: Medium  
**Environment**: Starter build  
**Retest Status**: Open  

---

## Summary
`runMigrations` (`src/migrations.ts`) executes all `*.sql` files on each boot with no record of what already ran. `index.ts:10-13` catches a migration failure, logs a warning and starts the server anyway. Today it is harmless only because 001/002 are idempotent; any non-idempotent migration (e.g. PR-17's `DELETE`) would run again on every restart, and a failed schema change would leave the service serving traffic on a half-migrated DB.

## Steps to Reproduce
1. `docker compose restart leads`
2. `docker compose logs leads`

## Expected Behavior
Applied migrations are recorded (e.g. `leads.schema_migrations`) and skipped; a failed migration stops startup.

## Actual Behavior
```
[Migrations] Running 001_init.sql... Completed
[Migrations] Running 002_seed.sql... Completed      <- seed inserted again on every boot
[Migrations] Running 003_automation_idempotency.sql... Completed
```
and on failure: `[Server] Warning: Failed to run migrations on startup … Proceeding with server start...`

## Evidence
- Container log on every restart (observed at each rebuild in this session).
- `002_seed.sql` re-runs on every start; deleted seed rows reappear after a restart.

## Notes
This is what turns PR-17's cleanup migration into repeated data loss (see `PR-17-REVIEW.md`).
