-- Run ONLY on the isolated Neon candidate branch after reviewing.
-- Existing credentials stay usable until an administrator explicitly resets them.
ALTER TABLE cutover_auth.participant_credentials
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT false;
