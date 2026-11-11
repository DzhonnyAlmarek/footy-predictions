-- Apply after stage3_pending_kickoff.sql. The transaction is intentionally one-time.
BEGIN;
SET LOCAL lock_timeout = '5s';

LOCK TABLE footy_cutover.stages, footy_cutover.tours, footy_cutover.matches,
  footy_cutover.teams, footy_cutover.tournaments, footy_cutover.predictions,
  footy_cutover.points_ledger, footy_cutover.match_scores,
  cutover_auth.admin_prediction_audit, cutover_auth.created_matches,
  cutover_auth.result_write_allowlist, cutover_auth.test_matches IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE approved_stage3 (
  match_id bigint PRIMARY KEY,
  tour_id bigint NOT NULL,
  competition text NOT NULL,
  home_slug text NOT NULL,
  away_slug text NOT NULL,
  match_date date NOT NULL,
  moscow_time time
) ON COMMIT DROP;

INSERT INTO approved_stage3 VALUES
  (458, 85, 'russian-cup', 'akron', 'cska', DATE '2026-11-24', TIME '17:00'),
  (459, 85, 'russian-cup', 'orenburg', 'spartak', DATE '2026-11-26', TIME '17:00'),
  (460, 85, 'russian-cup', 'dinamo-moskva', 'Fakel', DATE '2026-11-26', TIME '19:30'),
  (461, 84, 'ucl', 'man-city', 'napoli', DATE '2026-11-24', TIME '23:00'),
  (462, 84, 'ucl', 'arsenal', 'dortmund', DATE '2026-11-24', TIME '23:00'),
  (463, 84, 'ucl', 'real-madrid', 'psv', DATE '2026-11-24', TIME '23:00'),
  (464, 84, 'ucl', 'galatasaray', 'aston villa', DATE '2026-11-24', TIME '20:45'),
  (465, 84, 'ucl', 'feyenoord', 'porto', DATE '2026-11-24', TIME '23:00'),
  (466, 84, 'ucl', 'psg', 'roma', DATE '2026-11-25', TIME '23:00'),
  (467, 84, 'ucl', 'sporting', 'manchester-united', DATE '2026-11-25', TIME '23:00'),
  (468, 84, 'ucl', 'Inter', 'stuttgart', DATE '2026-11-25', TIME '23:00'),
  (469, 84, 'ucl', 'lille', 'bayern', DATE '2026-11-25', TIME '23:00'),
  (470, 84, 'ucl', 'brugge', 'liverpool', DATE '2026-11-25', TIME '23:00'),
  (471, 84, 'ucl', 'shakhter', 'fenerbahce', DATE '2026-11-25', TIME '23:00'),
  (472, 84, 'ucl', 'barcelona', 'man-city', DATE '2026-12-08', TIME '23:00'),
  (473, 84, 'ucl', 'aston villa', 'psg', DATE '2026-12-08', TIME '23:00'),
  (474, 84, 'ucl', 'roma', 'sporting', DATE '2026-12-08', TIME '23:00'),
  (475, 84, 'ucl', 'manchester-united', 'rb-leipzig', DATE '2026-12-08', TIME '23:00'),
  (476, 84, 'ucl', 'arsenal', 'real-madrid', DATE '2026-12-09', TIME '23:00'),
  (477, 84, 'ucl', 'dortmund', 'Inter', DATE '2026-12-09', TIME '23:00'),
  (478, 84, 'ucl', 'liverpool', 'porto', DATE '2026-12-09', TIME '23:00'),
  (479, 84, 'ucl', 'psv', 'atletico', DATE '2026-12-09', TIME '23:00'),
  (480, 84, 'epl', 'man-city', 'chelsea', DATE '2026-12-12', TIME '20:30'),
  (481, 84, 'serie-a', 'Lazio', 'roma', DATE '2026-12-13', TIME '14:30'),
  (482, 84, 'serie-a', 'napoli', 'ac-milan', DATE '2026-12-13', TIME '22:45'),
  (483, 84, 'la-liga', 'atletico', 'valencia', DATE '2026-12-13', NULL),
  (484, 84, 'bundesliga', 'rb-leipzig', 'dortmund', DATE '2026-12-19', TIME '20:30'),
  (485, 84, 'epl', 'liverpool', 'tottenham', DATE '2026-12-19', TIME '20:30'),
  (486, 84, 'serie-a', 'roma', 'juventus', DATE '2026-12-19', TIME '22:45'),
  (487, 84, 'epl', 'arsenal', 'manchester-united', DATE '2026-12-20', TIME '19:30'),
  (488, 84, 'serie-a', 'atalanta', 'napoli', DATE '2026-12-20', TIME '22:45'),
  (489, 84, 'la-liga', 'barcelona', 'real-sociedad', DATE '2026-12-20', NULL);

DO $migration$
DECLARE
  updated_matches integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM footy_cutover.stages
      WHERE id=15 AND is_current AND status='published' AND matches_required=56)
     OR (SELECT count(*) FROM footy_cutover.tours WHERE stage_id=15) <> 7
     OR (SELECT count(*) FROM footy_cutover.tours WHERE stage_id=15 AND
       (id,tour_no) IN ((95,'15'),(83,'16'),(100,'17'),(85,'18'),(84,'19'),(101,'20'),(92,'21'))) <> 7
     OR (SELECT count(*) FROM footy_cutover.matches WHERE stage_id=15) <> 56
     OR (SELECT count(*) FROM footy_cutover.matches WHERE stage_id=15 AND id BETWEEN 434 AND 489
         AND stage_match_no=id-433 AND tour_id=CASE
           WHEN id<=441 THEN 95 WHEN id<=449 THEN 83 WHEN id<=457 THEN 100
           WHEN id<=465 THEN 85 WHEN id<=473 THEN 84 WHEN id<=481 THEN 101 ELSE 92 END) <> 56
     OR EXISTS (SELECT 1 FROM footy_cutover.matches
         WHERE tour_id IN (95,83,100,85,84,101,92) AND stage_id IS DISTINCT FROM 15)
     OR EXISTS (SELECT 1 FROM footy_cutover.matches
         WHERE stage_id=15 AND id BETWEEN 458 AND 489
           AND (status<>'scheduled' OR home_score IS NOT NULL OR away_score IS NOT NULL
             OR home_penalty_goals<>0 OR away_penalty_goals<>0
             OR kickoff_at IS DISTINCT FROM CASE tour_id
               WHEN 85 THEN TIMESTAMPTZ '2027-02-26 09:00+00'
               WHEN 84 THEN TIMESTAMPTZ '2027-03-05 09:00+00'
               WHEN 101 THEN TIMESTAMPTZ '2027-03-12 09:00+00'
               WHEN 92 THEN TIMESTAMPTZ '2027-03-19 09:00+00' END))
  THEN RAISE EXCEPTION 'Stage III no longer matches the migration baseline'; END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT match_id FROM footy_cutover.predictions
      UNION ALL SELECT match_id FROM footy_cutover.points_ledger
      UNION ALL SELECT match_id FROM footy_cutover.match_scores
      UNION ALL SELECT match_id FROM cutover_auth.admin_prediction_audit
      UNION ALL SELECT match_id FROM cutover_auth.created_matches
      UNION ALL SELECT match_id FROM cutover_auth.test_matches
    ) dependencies JOIN approved_stage3 a USING (match_id)
  ) THEN RAISE EXCEPTION 'At least one fixture being replaced has dependent data'; END IF;

  -- Imported IDs can be ahead of the identity sequences.
  EXECUTE format('ALTER TABLE footy_cutover.tournaments ALTER COLUMN id RESTART WITH %s',
    (SELECT greatest(coalesce(max(id),0),coalesce(pg_sequence_last_value(
      pg_get_serial_sequence('footy_cutover.tournaments','id')::regclass),0))+1 FROM footy_cutover.tournaments));
  EXECUTE format('ALTER TABLE footy_cutover.teams ALTER COLUMN id RESTART WITH %s',
    (SELECT greatest(coalesce(max(id),0),coalesce(pg_sequence_last_value(
      pg_get_serial_sequence('footy_cutover.teams','id')::regclass),0))+1 FROM footy_cutover.teams));

  INSERT INTO footy_cutover.tournaments (name,slug) VALUES
    ('Кубок России','russian-cup'), ('АПЛ','epl'), ('Серия А','serie-a'),
    ('Бундеслига','bundesliga'), ('Ла Лига','la-liga')
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO footy_cutover.teams (name,slug) VALUES
    ('Фейеноорд','feyenoord'),
    ('Порту','porto'),
    ('Манчестер Юнайтед','manchester-united'),
    ('Штутгарт','stuttgart'),
    ('Лилль','lille'),
    ('Фенербахче','fenerbahce'),
    ('РБ Лейпциг','rb-leipzig'),
    ('Милан','ac-milan'),
    ('Валенсия','valencia'),
    ('Реал Сосьедад','real-sociedad')
  ON CONFLICT (slug) DO NOTHING;

  UPDATE footy_cutover.tours SET tour_no='stage3-migration-85' WHERE id=85;
  UPDATE footy_cutover.tours SET tour_no='18', name='Тур 18' WHERE id=100;
  UPDATE footy_cutover.tours SET tour_no='17', name='Тур 17' WHERE id=83;
  UPDATE footy_cutover.tours SET tour_no='16', name='Тур 16' WHERE id=85;

  UPDATE footy_cutover.matches SET stage_match_no=stage_match_no+3
  WHERE stage_id=15 AND id BETWEEN 442 AND 457;

  UPDATE footy_cutover.matches m
  SET tour_id=a.tour_id,
      tournament_id=t.id,
      home_team_id=h.id,
      away_team_id=v.id,
      stage_match_no=CASE WHEN a.tour_id=85 THEN a.match_id-449 ELSE a.match_id-433 END,
      kickoff_at=(a.match_date+a.moscow_time) AT TIME ZONE 'Europe/Moscow',
      deadline_at=(a.match_date+a.moscow_time) AT TIME ZONE 'Europe/Moscow',
      pending_kickoff_date=CASE WHEN a.moscow_time IS NULL THEN a.match_date END
  FROM approved_stage3 a
  JOIN footy_cutover.tournaments t ON t.slug=a.competition
  JOIN footy_cutover.teams h ON h.slug=a.home_slug
  JOIN footy_cutover.teams v ON v.slug=a.away_slug
  WHERE m.id=a.match_id AND m.stage_id=15;
  GET DIAGNOSTICS updated_matches = ROW_COUNT;
  IF updated_matches <> 32 THEN RAISE EXCEPTION 'Expected 32 replacements, got %', updated_matches; END IF;

  DELETE FROM footy_cutover.tours t WHERE stage_id=15 AND id IN (101,92)
    AND NOT EXISTS (SELECT 1 FROM footy_cutover.matches m WHERE m.tour_id=t.id);

  IF (SELECT array_agg(match_count ORDER BY tour_no) FROM (
      SELECT t.tour_no, count(m.id)::integer AS match_count
      FROM footy_cutover.tours t LEFT JOIN footy_cutover.matches m ON m.tour_id=t.id
      WHERE t.stage_id=15 GROUP BY t.tour_no
    ) counts) IS DISTINCT FROM ARRAY[8,3,8,8,29]
    OR (SELECT count(DISTINCT stage_match_no) FROM footy_cutover.matches WHERE stage_id=15) <> 56
    OR (SELECT array_agg(id ORDER BY id) FROM footy_cutover.matches
        WHERE stage_id=15 AND pending_kickoff_date IS NOT NULL) IS DISTINCT FROM ARRAY[483,489]::bigint[]
    OR EXISTS (SELECT 1 FROM footy_cutover.matches WHERE stage_id=15
        AND COALESCE((kickoff_at AT TIME ZONE 'Europe/Moscow')::date, pending_kickoff_date) >= DATE '2027-01-01')
  THEN RAISE EXCEPTION 'Stage III calendar verification failed'; END IF;
END
$migration$;
COMMIT;
