-- Execute ONLY on a disposable validation Neon branch.
-- Create an isolated, historical-data copy. Does not modify public, migration_source or test_auth.
-- Snapshot is NOT a final production sync.
BEGIN;
CREATE SCHEMA IF NOT EXISTS footy_cutover;
CREATE TABLE IF NOT EXISTS footy_cutover.profiles (LIKE migration_source.profiles INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.tournaments (LIKE migration_source.tournaments INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.stages (LIKE migration_source.stages INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.tours (LIKE migration_source.tours INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.teams (LIKE migration_source.teams INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.matches (LIKE migration_source.matches INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.predictions (LIKE migration_source.predictions INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.points_ledger (LIKE migration_source.points_ledger INCLUDING ALL);
CREATE TABLE IF NOT EXISTS footy_cutover.match_scores (LIKE migration_source.match_scores INCLUDING ALL);
INSERT INTO footy_cutover.profiles SELECT * FROM migration_source.profiles ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.tournaments SELECT * FROM migration_source.tournaments ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.stages SELECT * FROM migration_source.stages ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.tours SELECT * FROM migration_source.tours ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.teams SELECT * FROM migration_source.teams ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.matches SELECT * FROM migration_source.matches ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.predictions SELECT * FROM migration_source.predictions ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.points_ledger SELECT * FROM migration_source.points_ledger ON CONFLICT DO NOTHING;
INSERT INTO footy_cutover.match_scores SELECT * FROM migration_source.match_scores ON CONFLICT DO NOTHING;
COMMIT;
