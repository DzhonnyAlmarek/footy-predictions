-- ONLY for Neon branch supabase-full-migration-work-2026-10-09.
-- Security primitives; does NOT enable login, register users or issue invitations.
BEGIN;
CREATE TABLE IF NOT EXISTS test_auth.rate_limit_buckets (
  scope text NOT NULL CHECK (scope IN ('login_ip', 'login_account', 'enroll_ip', 'enroll_token')),
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  PRIMARY KEY (scope, subject_hash, window_start)
);
REVOKE ALL ON test_auth.rate_limit_buckets FROM PUBLIC;

CREATE TABLE IF NOT EXISTS test_auth.participant_sessions (
  session_hash bytea PRIMARY KEY CHECK (octet_length(session_hash) = 32),
  user_id uuid NOT NULL REFERENCES test_auth.participant_credentials(user_id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  CONSTRAINT session_expiry CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS participant_sessions_user_idx
  ON test_auth.participant_sessions(user_id, expires_at);
REVOKE ALL ON test_auth.participant_sessions FROM PUBLIC;

-- Atomic limit shared across server instances. Both login_ip AND login_account
-- must pass before password verification; both are charged even on failure.
CREATE OR REPLACE FUNCTION test_auth.consume_rate_limit(
  p_scope text,
  p_subject_hash bytea,
  p_limit integer,
  p_window_seconds integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, test_auth
AS $$
DECLARE
  v_start timestamptz;
  v_attempts integer;
BEGIN
  IF p_scope NOT IN ('login_ip', 'login_account', 'enroll_ip', 'enroll_token')
    OR p_subject_hash IS NULL OR octet_length(p_subject_hash) <> 32
    OR p_limit < 1 OR p_limit > 100 OR p_window_seconds < 60
    OR p_window_seconds > 86400 THEN
    RETURN false;
  END IF;
  v_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  INSERT INTO test_auth.rate_limit_buckets(scope, subject_hash, window_start, attempts)
  VALUES (p_scope, p_subject_hash, v_start, 1)
  ON CONFLICT (scope, subject_hash, window_start)
  DO UPDATE SET attempts = test_auth.rate_limit_buckets.attempts + 1
  RETURNING attempts INTO v_attempts;
  RETURN v_attempts <= p_limit;
END
$$;

-- Session validity is checked against live account state on every request.
CREATE OR REPLACE FUNCTION test_auth.session_user(p_session_hash bytea)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, test_auth
AS $$
  SELECT s.user_id
  FROM test_auth.participant_sessions s
  JOIN test_auth.participant_credentials c ON c.user_id = s.user_id
  WHERE s.session_hash = p_session_hash
    AND octet_length(p_session_hash) = 32
    AND s.revoked_at IS NULL
    AND s.expires_at > now()
    AND c.enabled = true
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION test_auth.consume_rate_limit(text,bytea,integer,integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION test_auth.session_user(bytea) FROM PUBLIC;
COMMIT;
