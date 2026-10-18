-- Apply ONLY to the disposable Neon cutover branch, never to the live database.
-- Imported IDs do not automatically advance an identity sequence.
SELECT setval(
  pg_get_serial_sequence('footy_cutover.matches', 'id'),
  GREATEST((SELECT COALESCE(MAX(id), 1) FROM footy_cutover.matches), 1),
  true
);
