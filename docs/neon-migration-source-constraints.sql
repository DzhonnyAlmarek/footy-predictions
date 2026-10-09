-- Footy migration-work ONLY. NOT for production Supabase or Neon main branch.
-- Prepare PK/UNIQUE rules matching the source schema. Run manually only after approval.
-- psql -X -v ON_ERROR_STOP=1 -1 -f docs/neon-migration-source-constraints.sql
-- Explicitly target branch br-snowy-dream-b1z9gj1l, schema migration_source.
-- Transactional: any conflict aborts every change.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
ALTER TABLE migration_source.analytics_stage_baseline ADD CONSTRAINT analytics_stage_baseline_pkey PRIMARY KEY(stage_id);
ALTER TABLE migration_source.analytics_stage_user ADD CONSTRAINT analytics_stage_user_pkey PRIMARY KEY(stage_id,user_id);
ALTER TABLE migration_source.analytics_stage_user_archetype ADD CONSTRAINT analytics_stage_user_archetype_pkey PRIMARY KEY(stage_id,user_id);
ALTER TABLE migration_source.analytics_stage_user_momentum ADD CONSTRAINT analytics_stage_user_momentum_pkey PRIMARY KEY(stage_id,user_id);
ALTER TABLE migration_source.grand_prix_manual_scores ADD CONSTRAINT grand_prix_manual_scores_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.grand_prix_manual_scores ADD CONSTRAINT grand_prix_manual_scores_round_user_key UNIQUE(round_id,user_id);
ALTER TABLE migration_source.grand_prix_rounds ADD CONSTRAINT grand_prix_rounds_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.grand_prix_rounds ADD CONSTRAINT grand_prix_rounds_season_round_key UNIQUE(season_id,round_no);
ALTER TABLE migration_source.grand_prix_seasons ADD CONSTRAINT grand_prix_seasons_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.grand_prix_seasons ADD CONSTRAINT grand_prix_seasons_slug_key UNIQUE(slug);
-- The Supabase source has NO primary key for import_rpl_matches; do not invent one.
ALTER TABLE migration_source.match_scores ADD CONSTRAINT match_scores_pkey PRIMARY KEY(match_id,user_id);
ALTER TABLE migration_source.matches ADD CONSTRAINT matches_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.points_ledger ADD CONSTRAINT points_ledger_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.prediction_scores ADD CONSTRAINT prediction_scores_pkey PRIMARY KEY(prediction_id);
ALTER TABLE migration_source.predictions ADD CONSTRAINT predictions_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.profiles ADD CONSTRAINT profiles_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.profiles ADD CONSTRAINT profiles_username_key UNIQUE(username);
ALTER TABLE migration_source.stages ADD CONSTRAINT stages_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.teams ADD CONSTRAINT teams_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.teams ADD CONSTRAINT teams_slug_key UNIQUE(slug);
ALTER TABLE migration_source.tournaments ADD CONSTRAINT tournaments_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.tournaments ADD CONSTRAINT tournaments_slug_key UNIQUE(slug);
ALTER TABLE migration_source.tours ADD CONSTRAINT tours_pkey PRIMARY KEY(id);
ALTER TABLE migration_source.tours ADD CONSTRAINT tours_stage_tour_key UNIQUE(stage_id,tour_no);
COMMIT;
