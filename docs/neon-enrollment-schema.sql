-- APPLY ONLY TO NEON: supabase-full-migration-work-2026-10-09.
-- Intended for a future disabled-by-default enrollment API.
BEGIN;
CREATE TABLE IF NOT EXISTS test_auth.enrollment_invitations (
  token_hash bytea PRIMARY KEY CHECK (octet_length(token_hash) = 32),
  user_id uuid NOT NULL REFERENCES test_auth.participant_credentials(user_id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT expires_after_issue CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS enrollment_invitations_user_idx
  ON test_auth.enrollment_invitations(user_id, expires_at);
REVOKE ALL ON test_auth.enrollment_invitations FROM PUBLIC;

-- One atomic transaction: lock invite, reject expired/used tokens, and set password
-- only for previously unactivated user. Never pass raw token to this function.
CREATE OR REPLACE FUNCTION test_auth.redeem_enrollment(
  p_token_hash bytea, p_salt bytea, p_password_hash bytea
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, test_auth
AS $$
DECLARE
  v_user uuid;
BEGIN
  IF octet_length(p_token_hash) <> 32 OR octet_length(p_salt) <> 32
      OR octet_length(p_password_hash) <> 64 THEN
    RETURN false;
  END IF;
  SELECT user_id INTO v_user
  FROM test_auth.enrollment_invitations
  WHERE token_hash = p_token_hash AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF v_user IS NULL THEN RETURN false; END IF;
  UPDATE test_auth.participant_credentials
  SET password_salt = p_salt, password_hash = p_password_hash,
      password_set_at = now(), enabled = true
  WHERE user_id = v_user AND enabled = false AND password_hash IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE test_auth.enrollment_invitations SET used_at = now()
  WHERE token_hash = p_token_hash AND used_at IS NULL;
  RETURN FOUND;
END
$$;
REVOKE ALL ON FUNCTION test_auth.redeem_enrollment(bytea,bytea,bytea) FROM PUBLIC;
COMMIT;
