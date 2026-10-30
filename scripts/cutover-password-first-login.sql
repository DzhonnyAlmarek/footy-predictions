-- Apply ONLY to isolated Neon candidate branch before deploying the new code.
-- Existing candidate test passwords become temporary; ADMIN retains its current password.
BEGIN;
ALTER TABLE cutover_auth.participant_credentials
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
UPDATE cutover_auth.participant_credentials c
SET must_change_password = true
FROM footy_cutover.profiles p
WHERE p.id = c.user_id AND upper(p.username) <> 'ADMIN'
  AND c.enabled = true AND c.must_change_password = false;
COMMIT;
