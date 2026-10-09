-- Neon migration work branch only. Integration checks run in one transaction.
-- Temporary synthetic rows are ALWAYS rolled back, including when a test fails.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';
DO $tests$
DECLARE
  v_user uuid := gen_random_uuid();
  v_invite bytea := decode(repeat('c7',32),'hex');
  v_session bytea := decode(repeat('d8',32),'hex');
  v_limit bytea := decode(repeat('e9',32),'hex');
  v_allowed boolean;
  v_account uuid;
  v_active boolean;
  v_consumed boolean;
BEGIN
  -- Synthetic user only. Never change migrated profile IDs or credentials.
  INSERT INTO test_auth.participant_credentials(user_id)
  VALUES(v_user);
  IF test_auth.session_user(v_session) IS NOT NULL THEN
    RAISE EXCEPTION 'invalid session accepted';
  END IF;
  RAISE NOTICE 'PASS: unknown session rejected';

  -- Rate limit must be atomic and deny the fourth attempt in same window.
  FOR i IN 1..3 LOOP
    v_allowed := test_auth.consume_rate_limit('login_account',v_limit,3,900);
    IF v_allowed IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'attempt % unexpectedly denied', i;
    END IF;
  END LOOP;
  IF test_auth.consume_rate_limit('login_account',v_limit,3,900) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'rate limit bypassed';
  END IF;
  IF test_auth.consume_rate_limit('enroll_token',v_limit,1,900) IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'rate limit scopes are not isolated';
  END IF;
  IF test_auth.consume_rate_limit('bad_scope',v_limit,1,900) IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unknown limiter scope accepted';
  END IF;
  RAISE NOTICE 'PASS: limiter threshold and scope isolation';

  IF test_auth.redeem_enrollment(v_invite,decode(repeat('12',32),'hex'),decode(repeat('34',64),'hex')) THEN
    RAISE EXCEPTION 'nonexistent invitation redeemed';
  END IF;
  RAISE NOTICE 'PASS: unknown invitation rejected';

  INSERT INTO test_auth.enrollment_invitations(token_hash,user_id,expires_at)
  VALUES(v_invite,v_user,now() + interval '1 hour');

  INSERT INTO test_auth.participant_sessions(session_hash,user_id,expires_at)
  VALUES(v_session,v_user,now() + interval '1 hour');
  IF test_auth.session_user(v_session) IS NOT NULL THEN
    RAISE EXCEPTION 'disabled account session accepted';
  END IF;
  RAISE NOTICE 'PASS: inactive account has no valid session';

  v_consumed := test_auth.redeem_enrollment(v_invite,decode(repeat('12',32),'hex'),decode(repeat('34',64),'hex'));
  IF v_consumed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'valid invitation was not accepted';
  END IF;
  SELECT enabled INTO v_active FROM test_auth.participant_credentials WHERE user_id=v_user;
  IF v_active IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'participant not enabled after enrollment';
  END IF;
  IF test_auth.redeem_enrollment(v_invite,decode(repeat('56',32),'hex'),decode(repeat('78',64),'hex')) THEN
    RAISE EXCEPTION 'single-use invitation reused';
  END IF;
  RAISE NOTICE 'PASS: first enrollment succeeds, replay denied';

  SELECT test_auth.session_user(v_session) INTO v_account;
  IF v_account IS DISTINCT FROM v_user THEN
    RAISE EXCEPTION 'active session not recognized';
  END IF;
  UPDATE test_auth.participant_sessions SET revoked_at=now() WHERE session_hash=v_session;
  IF test_auth.session_user(v_session) IS NOT NULL THEN
    RAISE EXCEPTION 'revoked session accepted';
  END IF;
  RAISE NOTICE 'PASS: active session accepted, revoked session denied';

  UPDATE test_auth.participant_sessions SET revoked_at=NULL, expires_at=now()-interval '1 second'
  WHERE session_hash=v_session;
  IF test_auth.session_user(v_session) IS NOT NULL THEN
    RAISE EXCEPTION 'expired session accepted';
  END IF;
  RAISE NOTICE 'PASS: expired session denied';
END
$tests$;
ROLLBACK;
\echo PASS: transaction rolled back; no synthetic accounts, invitations or sessions retained
