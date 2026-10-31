-- Candidate Neon only. A reset link may be redeemed once within 24 hours.
CREATE TABLE IF NOT EXISTS cutover_auth.password_reset_links (
  token_hash bytea PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES cutover_auth.participant_credentials(user_id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_links_user_id_idx ON cutover_auth.password_reset_links (user_id);
