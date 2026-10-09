-- Run ONLY against Neon branch supabase-full-migration-work-2026-10-09.
-- Never run on Supabase production or Neon default branch.
-- Intentionally no Supabase auth identities, password hashes or tokens are imported.
BEGIN;
CREATE SCHEMA IF NOT EXISTS test_auth;
CREATE TABLE IF NOT EXISTS test_auth.participant_credentials (
  user_id uuid PRIMARY KEY,
  password_salt bytea,
  password_hash bytea,
  enabled boolean NOT NULL DEFAULT false,
  password_set_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT credentials_password_complete CHECK (
    (password_salt IS NULL AND password_hash IS NULL AND password_set_at IS NULL)
    OR
    (octet_length(password_salt) = 32 AND octet_length(password_hash) = 64 AND password_set_at IS NOT NULL)
  ),
  CONSTRAINT credentials_enabled_requires_password CHECK (
    NOT enabled OR (password_hash IS NOT NULL AND password_salt IS NOT NULL)
  )
);
REVOKE ALL ON SCHEMA test_auth FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA test_auth FROM PUBLIC;
-- Provision only disabled accounts; no passwords or activation codes.
INSERT INTO test_auth.participant_credentials (user_id)
SELECT id FROM migration_source.profiles
ON CONFLICT (user_id) DO NOTHING;
COMMIT;
