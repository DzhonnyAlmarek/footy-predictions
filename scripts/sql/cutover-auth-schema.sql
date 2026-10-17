-- Proposed authentication tables for a NEW, isolated cutover validation database.
-- Review before execution. Do not run against live Supabase or existing production Neon.
-- Profiles must already exist in footy_cutover.
BEGIN;
CREATE SCHEMA IF NOT EXISTS cutover_auth;
CREATE TABLE IF NOT EXISTS cutover_auth.participant_credentials (
  user_id uuid PRIMARY KEY REFERENCES footy_cutover.profiles(id),
  password_salt bytea NOT NULL CHECK (octet_length(password_salt) = 32),
  password_hash bytea NOT NULL CHECK (octet_length(password_hash) = 64),
  enabled boolean NOT NULL DEFAULT false,
  password_changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cutover_auth.participant_sessions (
  session_hash bytea PRIMARY KEY CHECK (octet_length(session_hash) = 32),
  user_id uuid NOT NULL REFERENCES footy_cutover.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS cutover_sessions_user_idx
  ON cutover_auth.participant_sessions(user_id);
CREATE INDEX IF NOT EXISTS cutover_sessions_expiry_idx
  ON cutover_auth.participant_sessions(expires_at);
CREATE TABLE IF NOT EXISTS cutover_auth.login_rate_limits (
  subject_hash bytea PRIMARY KEY CHECK (octet_length(subject_hash) = 32),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  window_started_at timestamptz NOT NULL DEFAULT now()
);
COMMIT;
