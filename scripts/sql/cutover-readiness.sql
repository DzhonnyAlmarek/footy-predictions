-- Read-only migration readiness checks. Run against a designated validation branch only.
-- Does not modify schemas, rows, permissions or credentials.
WITH table_counts AS (
  SELECT 'profiles' AS entity,(SELECT count(*) FROM migration_source.profiles) AS source_count,(SELECT count(*) FROM public.profiles) AS target_count
  UNION ALL SELECT 'tournaments',(SELECT count(*) FROM migration_source.tournaments),(SELECT count(*) FROM public.tournaments)
  UNION ALL SELECT 'stages',(SELECT count(*) FROM migration_source.stages),(SELECT count(*) FROM public.stages)
  UNION ALL SELECT 'tours',(SELECT count(*) FROM migration_source.tours),(SELECT count(*) FROM public.tours)
  UNION ALL SELECT 'teams',(SELECT count(*) FROM migration_source.teams),(SELECT count(*) FROM public.teams)
  UNION ALL SELECT 'matches',(SELECT count(*) FROM migration_source.matches),(SELECT count(*) FROM public.matches)
  UNION ALL SELECT 'predictions',(SELECT count(*) FROM migration_source.predictions),(SELECT count(*) FROM public.predictions)
  UNION ALL SELECT 'match_scores',(SELECT count(*) FROM migration_source.match_scores),(SELECT count(*) FROM public.match_scores)
  UNION ALL SELECT 'points_ledger',(SELECT count(*) FROM migration_source.points_ledger),(SELECT count(*) FROM public.points_ledger)
)
SELECT entity,source_count,target_count,source_count=target_count AS counts_match
FROM table_counts ORDER BY entity;
