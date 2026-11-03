-- Idempotency ledger for n8n automation (Section B).
-- One row per message the automation is allowed to send at most once
-- (e.g. 'solace-confirmed:pay_123', 'street-team-prospect:lead_456').
-- n8n claims a key with INSERT ... ON CONFLICT before sending, which is atomic,
-- so concurrent or replayed deliveries of the same event can never both send.
-- Idempotent: this file is re-run on every leads-service start.
-- Not touched by POST /__tools/reset on purpose: a reset must not allow re-sends.
CREATE SCHEMA IF NOT EXISTS automation;

CREATE TABLE IF NOT EXISTS automation.message_claims (
  dedup_key   VARCHAR(200) PRIMARY KEY,
  status      VARCHAR(20)  NOT NULL DEFAULT 'pending',  -- pending | sent | failed | skipped
  event_id    VARCHAR(64),
  workflow    VARCHAR(64)  NOT NULL,
  attempts    INTEGER      NOT NULL DEFAULT 1,
  last_error  TEXT,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

GRANT USAGE ON SCHEMA automation TO qa_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA automation TO qa_reader;
