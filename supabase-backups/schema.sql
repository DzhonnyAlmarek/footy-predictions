


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."assign_stage_match_no"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  next_no int;
begin
  if new.stage_id is null then
    raise exception 'stage_id is required';
  end if;

  if new.stage_match_no is null then
    select coalesce(max(stage_match_no), 0) + 1
      into next_no
    from public.matches
    where stage_id = new.stage_id;

    new.stage_match_no := next_no;
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."assign_stage_match_no"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_matches_delete"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.audit_log(actor_user_id, action, entity, entity_id, meta)
  values (
    auth.uid(),
    'delete',
    'matches',
    old.id::text,
    jsonb_build_object(
      'tournament_id', old.tournament_id,
      'home_team_id', old.home_team_id,
      'away_team_id', old.away_team_id,
      'kickoff_at', old.kickoff_at,
      'deadline_at', old.deadline_at,
      'status', old.status,
      'home_score', old.home_score,
      'away_score', old.away_score
    )
  );
  return old;
end;
$$;


ALTER FUNCTION "public"."audit_matches_delete"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_matches_insert"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.audit_log(actor_user_id, action, entity, entity_id, meta)
  values (
    auth.uid(),
    'insert',
    'matches',
    new.id::text,
    jsonb_build_object(
      'tournament_id', new.tournament_id,
      'home_team_id', new.home_team_id,
      'away_team_id', new.away_team_id,
      'kickoff_at', new.kickoff_at,
      'deadline_at', new.deadline_at,
      'status', new.status
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."audit_matches_insert"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_matches_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  insert into public.audit_log(actor_user_id, action, entity, entity_id, meta)
  values (
    auth.uid(),
    'update',
    'matches',
    new.id::text,
    jsonb_build_object(
      'old_status', old.status,
      'new_status', new.status,
      'old_score', concat(coalesce(old.home_score::text,'null'),':',coalesce(old.away_score::text,'null')),
      'new_score', concat(coalesce(new.home_score::text,'null'),':',coalesce(new.away_score::text,'null')),
      'old_kickoff_at', old.kickoff_at,
      'new_kickoff_at', new.kickoff_at,
      'old_deadline_at', old.deadline_at,
      'new_deadline_at', new.deadline_at
    )
  );
  return new;
end;
$$;


ALTER FUNCTION "public"."audit_matches_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_match_move_when_stage_locked"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  st text;
begin
  select status into st from public.stages where id = old.stage_id;

  if st = 'locked' and (new.stage_id <> old.stage_id or new.tour_id <> old.tour_id) then
    raise exception 'stage is locked; cannot move match between tours/stages';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_match_move_when_stage_locked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_match_move_when_stage_not_draft"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  st text;
begin
  select status into st from public.stages where id = old.stage_id;

  if st <> 'draft' and (new.stage_id <> old.stage_id or new.tour_id <> old.tour_id) then
    raise exception 'stage is not draft; cannot move match between tours/stages';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."block_match_move_when_stage_not_draft"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_match_write_when_stage_locked"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  st text;
  sid bigint;
begin
  sid := coalesce(new.stage_id, old.stage_id);
  select status into st from public.stages where id = sid;

  if st is null then
    raise exception 'stage not found';
  end if;

  if st = 'locked' then
    raise exception 'stage is locked; matches cannot be modified';
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."block_match_write_when_stage_locked"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."block_match_write_when_stage_not_draft"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  st text;
  sid bigint;
begin
  sid := coalesce(new.stage_id, old.stage_id);
  select status into st from public.stages where id = sid;

  if st is null then
    raise exception 'stage not found';
  end if;

  if st <> 'draft' then
    raise exception 'stage is not draft; matches cannot be modified';
  end if;

  return coalesce(new, old);
end;
$$;


ALTER FUNCTION "public"."block_match_write_when_stage_not_draft"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."enforce_match_stage"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  t_stage bigint;
begin
  if new.tour_id is null then
    raise exception 'tour_id is required';
  end if;

  select stage_id into t_stage
  from public.tours
  where id = new.tour_id;

  if t_stage is null then
    raise exception 'tour not found';
  end if;

  if new.stage_id is null then
    new.stage_id = t_stage;
  end if;

  if new.stage_id <> t_stage then
    raise exception 'match.stage_id must equal tours.stage_id';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."enforce_match_stage"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_leaderboard"("p_limit" integer DEFAULT 50) RETURNS TABLE("user_id" "uuid", "username" "text", "total_points" integer, "entries" integer)
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select
    p.id as user_id,
    coalesce(p.username, substring(p.id::text, 1, 8)) as username,
    coalesce(sum(pl.points), 0)::int as total_points,
    count(pl.id)::int as entries
  from public.profiles p
  left join public.points_ledger pl on pl.user_id = p.id
  group by p.id, p.username
  order by total_points desc, entries desc
  limit greatest(p_limit, 1);
$$;


ALTER FUNCTION "public"."get_leaderboard"("p_limit" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, username)
  values (new.id, null)
  on conflict (id) do nothing;
  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."lock_stage"("p_stage_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  cnt int;
  req int;
  dcnt int;
  mn int;
  mx int;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;

  select matches_required into req from public.stages where id = p_stage_id;
  if req is null then raise exception 'stage not found'; end if;

  select count(*) into cnt from public.matches where stage_id = p_stage_id;

  if cnt <> req then
    raise exception 'stage must have exactly % matches to lock, but has %', req, cnt;
  end if;

  select
    count(distinct stage_match_no),
    min(stage_match_no),
    max(stage_match_no)
  into dcnt, mn, mx
  from public.matches
  where stage_id = p_stage_id;

  if dcnt <> req or mn <> 1 or mx <> req then
    raise exception 'stage match numbers must be 1..% with no gaps', req;
  end if;

  update public.stages set status = 'locked' where id = p_stage_id;
end;
$$;


ALTER FUNCTION "public"."lock_stage"("p_stage_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_role_change"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  -- если запрос идёт от обычного пользователя (auth.uid() не NULL) — запрещаем менять role
  if auth.uid() is not null and new.role <> old.role then
    raise exception 'role cannot be changed by user';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_role_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."prevent_team_duplicate_in_tour"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
declare
  conflict_count int;
begin
  if new.tour_id is null then
    raise exception 'tour_id is required';
  end if;

  if new.home_team_id = new.away_team_id then
    raise exception 'same team twice in match';
  end if;

  -- проверяем, что home_team_id нигде уже не используется в этом туре
  select count(*)
    into conflict_count
  from public.matches m
  where m.tour_id = new.tour_id
    and m.id <> coalesce(new.id, -1)
    and (
      m.home_team_id = new.home_team_id
      or m.away_team_id = new.home_team_id
      or m.home_team_id = new.away_team_id
      or m.away_team_id = new.away_team_id
    );

  if conflict_count > 0 then
    raise exception 'team already used in this tour';
  end if;

  return new;
end;
$$;


ALTER FUNCTION "public"."prevent_team_duplicate_in_tour"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."publish_stage"("p_stage_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;

  update public.stages
  set status = 'published'
  where id = p_stage_id;

  if not found then
    raise exception 'stage not found';
  end if;
end;
$$;


ALTER FUNCTION "public"."publish_stage"("p_stage_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_stage_analytics"("p_stage_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_threshold numeric := 0.9; -- 0.9σ
begin
  delete from public.analytics_stage_user_archetype where stage_id = p_stage_id;
  delete from public.analytics_stage_baseline where stage_id = p_stage_id;
  delete from public.analytics_stage_user where stage_id = p_stage_id;

  with finished_matches as (
    select m.id as match_id, m.stage_id, m.home_score, m.away_score
    from public.matches m
    where m.stage_id = p_stage_id
      and m.status = 'finished'
      and m.home_score is not null
      and m.away_score is not null
  ),
  pred as (
    select
      p.user_id,
      fm.stage_id,
      fm.match_id,
      p.home_pred,
      p.away_pred,
      fm.home_score,
      fm.away_score
    from public.predictions p
    join finished_matches fm on fm.match_id = p.match_id
    where p.home_pred is not null
      and p.away_pred is not null
  ),
  pred2 as (
    select
      stage_id,
      user_id,
      match_id,
      home_pred,
      away_pred,
      home_score,
      away_score,
      case
        when home_pred = away_pred and home_score = away_score then 1
        when home_pred > away_pred and home_score > away_score then 1
        when home_pred < away_pred and home_score < away_score then 1
        else 0
      end as outcome_hit,
      case when (home_pred - away_pred) = (home_score - away_score) then 1 else 0 end as diff_hit
    from pred
  ),
  agg as (
    select
      stage_id,
      user_id,
      count(*)::int as matches_count,

      sum(case when home_pred > away_pred then 1 else 0 end)::int as pred_home_count,
      sum(case when home_pred = away_pred then 1 else 0 end)::int as pred_draw_count,
      sum(case when home_pred < away_pred then 1 else 0 end)::int as pred_away_count,

      sum(case when home_pred = home_score and away_pred = away_score then 1 else 0 end)::int as exact_count,

      sum((home_pred + away_pred)::numeric) as pred_total_sum,
      sum(abs(home_pred - away_pred)::numeric) as pred_absdiff_sum,
      sum(case when abs(home_pred - away_pred) >= 2 then 1 else 0 end)::int as pred_bigdiff_count,

      sum(outcome_hit)::int as outcome_hit_count,
      sum(diff_hit)::int as diff_hit_count
    from pred2
    group by stage_id, user_id
  )
  insert into public.analytics_stage_user (
    stage_id, user_id,
    matches_count,
    pred_home_count, pred_draw_count, pred_away_count,
    exact_count,
    pred_total_sum, pred_absdiff_sum, pred_bigdiff_count,
    outcome_hit_count, diff_hit_count,
    updated_at
  )
  select
    stage_id, user_id,
    matches_count,
    pred_home_count, pred_draw_count, pred_away_count,
    exact_count,
    pred_total_sum, pred_absdiff_sum, pred_bigdiff_count,
    outcome_hit_count, diff_hit_count,
    now()
  from agg;

  -- baseline mean/std по этапу
  with u as (
    select
      stage_id,
      user_id,
      matches_count,
      (exact_count::numeric / nullif(matches_count,0)) as exact_rate,
      (pred_draw_count::numeric / nullif(matches_count,0)) as draw_rate,
      (pred_home_count::numeric / nullif(matches_count,0)) as home_rate,
      (pred_away_count::numeric / nullif(matches_count,0)) as away_rate,
      (pred_total_sum / nullif(matches_count,0)) as avg_total,
      (pred_absdiff_sum / nullif(matches_count,0)) as absdiff_avg,
      (outcome_hit_count::numeric / nullif(matches_count,0)) as outcome_hit_rate,
      (diff_hit_count::numeric / nullif(matches_count,0)) as diff_hit_rate
    from public.analytics_stage_user
    where stage_id = p_stage_id
      and matches_count > 0
  )
  insert into public.analytics_stage_baseline (
    stage_id, users_count,
    mean_exact_rate, std_exact_rate,
    mean_draw_rate,  std_draw_rate,
    mean_home_rate,  std_home_rate,
    mean_away_rate,  std_away_rate,
    mean_avg_total,  std_avg_total,
    mean_absdiff_avg, std_absdiff_avg,
    mean_outcome_hit_rate, std_outcome_hit_rate,
    mean_diff_hit_rate, std_diff_hit_rate,
    updated_at
  )
  select
    p_stage_id,
    count(*)::int as users_count,

    coalesce(avg(exact_rate),0),
    coalesce(stddev_samp(exact_rate),0),

    coalesce(avg(draw_rate),0),
    coalesce(stddev_samp(draw_rate),0),

    coalesce(avg(home_rate),0),
    coalesce(stddev_samp(home_rate),0),

    coalesce(avg(away_rate),0),
    coalesce(stddev_samp(away_rate),0),

    coalesce(avg(avg_total),0),
    coalesce(stddev_samp(avg_total),0),

    coalesce(avg(absdiff_avg),0),
    coalesce(stddev_samp(absdiff_avg),0),

    coalesce(avg(outcome_hit_rate),0),
    coalesce(stddev_samp(outcome_hit_rate),0),

    coalesce(avg(diff_hit_rate),0),
    coalesce(stddev_samp(diff_hit_rate),0),

    now()
  from u;

  -- архетипы: стиль отдельно, а точность пойдёт в “показатели” на UI
  with base as (
    select * from public.analytics_stage_baseline where stage_id = p_stage_id
  ),
  u as (
    select
      a.*,
      (a.exact_count::numeric / nullif(a.matches_count,0)) as exact_rate,
      (a.pred_draw_count::numeric / nullif(a.matches_count,0)) as draw_rate,
      (a.pred_home_count::numeric / nullif(a.matches_count,0)) as home_rate,
      (a.pred_away_count::numeric / nullif(a.matches_count,0)) as away_rate,
      (a.pred_total_sum / nullif(a.matches_count,0)) as avg_total,
      (a.pred_absdiff_sum / nullif(a.matches_count,0)) as absdiff_avg,
      (a.pred_bigdiff_count::numeric / nullif(a.matches_count,0)) as bigdiff_rate
    from public.analytics_stage_user a
    where a.stage_id = p_stage_id
  ),
  scored as (
    select
      u.*,
      b.users_count,
      case when b.std_exact_rate > 0 then (u.exact_rate - b.mean_exact_rate)/b.std_exact_rate else 0 end as z_exact,
      case when b.std_draw_rate  > 0 then (u.draw_rate  - b.mean_draw_rate )/b.std_draw_rate  else 0 end as z_draw,
      case when b.std_home_rate  > 0 then (u.home_rate  - b.mean_home_rate )/b.std_home_rate  else 0 end as z_home,
      case when b.std_away_rate  > 0 then (u.away_rate  - b.mean_away_rate )/b.std_away_rate  else 0 end as z_away,
      case when b.std_avg_total  > 0 then (u.avg_total  - b.mean_avg_total )/b.std_avg_total  else 0 end as z_total,
      case when b.std_absdiff_avg> 0 then (u.absdiff_avg- b.mean_absdiff_avg)/b.std_absdiff_avg else 0 end as z_risk,

      b.mean_exact_rate, b.mean_draw_rate, b.mean_home_rate, b.mean_away_rate, b.mean_avg_total, b.mean_absdiff_avg
    from u
    cross join base b
  ),
  classified as (
    select
      s.*,
      case
        when s.matches_count < 8 then 'forming'
        when s.matches_count < 13 then 'preliminary'
        else 'final'
      end as state,

      (s.z_exact >= v_threshold) as is_sniper,
      (s.z_draw  >= v_threshold) as is_peace,
      (s.z_risk  >= v_threshold) as is_risky,
      (s.z_total <= -v_threshold and s.z_risk <= 0) as is_rational,
      (s.z_home  >= v_threshold and s.home_rate > s.away_rate) as is_homebias,
      (s.z_away  >= v_threshold and s.away_rate > s.home_rate) as is_awaybias
    from scored s
  ),
  picked as (
    select
      c.*,
      case
        when c.state = 'forming' then 'forming'
        when c.is_sniper then 'sniper'
        when c.is_peace  then 'peacekeeper'
        when c.is_risky  then 'risky'
        when c.is_rational then 'rational'
        when c.is_homebias then 'home'
        when c.is_awaybias then 'away'
        else 'universal'
      end as archetype_key
    from classified c
  )
  insert into public.analytics_stage_user_archetype (
    stage_id, user_id,
    archetype_key, title_ru, summary_ru, reasons_ru,
    state, updated_at
  )
  select
    p_stage_id,
    p.user_id,
    p.archetype_key,

    case p.archetype_key
      when 'forming' then 'Формируется'
      when 'sniper' then 'Снайпер'
      when 'peacekeeper' then 'Миротворец'
      when 'risky' then 'Рисковый'
      when 'rational' then 'Рационалист'
      when 'home' then 'Домосед'
      when 'away' then 'Гостевой романтик'
      else 'Универсал'
    end as title_ru,

    case p.archetype_key
      when 'forming' then format('Недостаточно данных: учтено %s из 8 матчей.', p.matches_count)
      when 'sniper' then 'Чаще других попадаете в точный счёт.'
      when 'peacekeeper' then 'Чаще остальных ставите на ничьи.'
      when 'risky' then 'Любите уверенные победы и крупные разницы.'
      when 'rational' then 'Предпочитаете аккуратные и низовые счета.'
      when 'home' then 'Чаще верите в победу хозяев.'
      when 'away' then 'Чаще других ставите на гостей.'
      else 'Ваш стиль близок к среднему по этапу.'
    end as summary_ru,

    case p.archetype_key
      when 'forming' then jsonb_build_array(
        format('Матчей учтено: %s.', p.matches_count),
        'Архетип появится, когда будет достаточно завершённых матчей.'
      )
      when 'sniper' then jsonb_build_array(
        format('Точные счета: %s%% (среднее: %s%%).', round(p.exact_rate*100), round(p.mean_exact_rate*100)),
        format('Матчей учтено: %s.', p.matches_count)
      )
      when 'peacekeeper' then jsonb_build_array(
        format('Ничьи в прогнозах: %s%% (среднее: %s%%).', round(p.draw_rate*100), round(p.mean_draw_rate*100)),
        format('Матчей учтено: %s.', p.matches_count)
      )
      when 'risky' then jsonb_build_array(
        format('Средняя разница: %s (среднее: %s).', round(p.absdiff_avg::numeric,2), round(p.mean_absdiff_avg::numeric,2)),
        format('Крупные разницы (2+): %s%%.', round(p.bigdiff_rate*100)),
        format('Матчей учтено: %s.', p.matches_count)
      )
      when 'rational' then jsonb_build_array(
        format('Средний тотал: %s (среднее: %s).', round(p.avg_total::numeric,2), round(p.mean_avg_total::numeric,2)),
        format('Средняя разница: %s (среднее: %s).', round(p.absdiff_avg::numeric,2), round(p.mean_absdiff_avg::numeric,2)),
        format('Матчей учтено: %s.', p.matches_count)
      )
      when 'home' then jsonb_build_array(
        format('На хозяев: %s%% (среднее: %s%%).', round(p.home_rate*100), round(p.mean_home_rate*100)),
        format('Матчей учтено: %s.', p.matches_count)
      )
      when 'away' then jsonb_build_array(
        format('На гостей: %s%% (среднее: %s%%).', round(p.away_rate*100), round(p.mean_away_rate*100)),
        format('Матчей учтено: %s.', p.matches_count)
      )
      else jsonb_build_array(
        format('Точные счета: %s%% (среднее: %s%%).', round(p.exact_rate*100), round(p.mean_exact_rate*100)),
        format('Ничьи: %s%% (среднее: %s%%).', round(p.draw_rate*100), round(p.mean_draw_rate*100)),
        format('Матчей учтено: %s.', p.matches_count)
      )
    end as reasons_ru,

    p.state,
    now()
  from picked p;

end;
$$;


ALTER FUNCTION "public"."recalculate_stage_analytics"("p_stage_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."recalculate_stage_momentum"("p_stage_id" bigint, "p_n" integer DEFAULT 5, "p_k" integer DEFAULT 10) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  delete from analytics_stage_user_momentum
  where stage_id = p_stage_id;

  insert into analytics_stage_user_momentum (
    stage_id, user_id, n, k,
    matches_count,
    points_series, momentum_series,
    momentum_current, avg_last_n, avg_all,
    updated_at
  )
  with stage_matches as (
    select id, stage_match_no
    from matches
    where stage_id = p_stage_id
      and home_score is not null
      and away_score is not null
      and stage_match_no is not null
  ),
  base as (
    -- очки берём из prediction_scores.total
    select
      ps.user_id,
      sm.stage_match_no,
      ps.match_id,
      coalesce(ps.total, 0)::numeric as points
    from prediction_scores ps
    join stage_matches sm on sm.id = ps.match_id
  ),
  ordered as (
    select
      user_id,
      stage_match_no,
      match_id,
      points,
      avg(points) over (
        partition by user_id
        order by stage_match_no
        rows between (p_n - 1) preceding and current row
      ) as avg_last_n,
      avg(points) over (
        partition by user_id
        order by stage_match_no
        rows between unbounded preceding and current row
      ) as avg_all
    from base
  ),
  with_mom as (
    select
      *,
      (avg_last_n - avg_all) as momentum
    from ordered
  ),
  lastk as (
    select *
    from (
      select
        *,
        row_number() over (partition by user_id order by stage_match_no desc) as rdesc
      from with_mom
    ) t
    where rdesc <= p_k
  ),
  agg as (
    select
      p_stage_id as stage_id,
      user_id,
      p_n as n,
      p_k as k,
      count(*)::int as matches_count,

      jsonb_agg(points order by stage_match_no) as points_series,
      jsonb_agg(round(momentum::numeric, 4) order by stage_match_no) as momentum_series,

      (array_agg(round(momentum::numeric, 4) order by stage_match_no desc))[1] as momentum_current,
      (array_agg(round(avg_last_n::numeric, 4) order by stage_match_no desc))[1] as avg_last_n,
      (array_agg(round(avg_all::numeric, 4) order by stage_match_no desc))[1] as avg_all,

      now() as updated_at
    from lastk
    group by user_id
  )
  select
    stage_id, user_id, n, k,
    matches_count,
    points_series, momentum_series,
    coalesce(momentum_current, 0),
    coalesce(avg_last_n, 0),
    coalesce(avg_all, 0),
    updated_at
  from agg;

end;
$$;


ALTER FUNCTION "public"."recalculate_stage_momentum"("p_stage_id" bigint, "p_n" integer, "p_k" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_match"("p_match_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_is_admin boolean;
begin
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  ) into v_is_admin;

  if not v_is_admin then
    raise exception 'admin only';
  end if;

  perform public.score_match_core(p_match_id);
end;
$$;


ALTER FUNCTION "public"."score_match"("p_match_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_match_core"("p_match_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_status text;
  v_home int;
  v_away int;

  v_cnt_outcome int;
  v_cnt_diff int;

  v_outcome_mult numeric(6,2);
  v_diff_mult numeric(6,2);
begin
  select status, home_score, away_score
    into v_status, v_home, v_away
  from public.matches
  where id = p_match_id;

  if v_status is null then
    raise exception 'match not found';
  end if;

  if v_status <> 'finished' then
    raise exception 'match status must be finished';
  end if;

  if v_home is null or v_away is null then
    raise exception 'match score is null';
  end if;

  delete from public.points_ledger pl
  where pl.match_id = p_match_id;

  with preds as (
    select p.user_id, p.home_pred::int ph, p.away_pred::int pa
    from public.predictions p
    where p.match_id = p_match_id
  ),
  flags as (
    select
      user_id, ph, pa,
      case
        when (v_home > v_away and ph > pa) then true
        when (v_home = v_away and ph = pa) then true
        when (v_home < v_away and ph < pa) then true
        else false
      end as ok_outcome,
      ((ph - pa) = (v_home - v_away)) as ok_diff
    from preds
  )
  select
    coalesce(sum(case when ok_outcome then 1 else 0 end), 0),
    coalesce(sum(case when ok_diff then 1 else 0 end), 0)
  into v_cnt_outcome, v_cnt_diff
  from flags;

  v_outcome_mult := case
    when v_cnt_outcome = 1 then 1.75
    when v_cnt_outcome = 2 then 1.50
    when v_cnt_outcome = 3 then 1.25
    else 1.00
  end;

  v_diff_mult := case
    when v_cnt_diff = 1 then 1.75
    when v_cnt_diff = 2 then 1.50
    when v_cnt_diff = 3 then 1.25
    else 1.00
  end;

  insert into public.points_ledger
    (user_id, match_id, points,
     points_outcome, points_diff, points_h1, points_h2, points_bonus,
     points_outcome_base, points_outcome_bonus, points_diff_base, points_diff_bonus,
     created_at)
  select
    t.user_id,
    p_match_id,

    (t.po_total + t.pd_total + t.ph1 + t.ph2 + t.pb)::numeric(6,2) as points,

    t.po_total::numeric(6,2) as points_outcome,
    t.pd_total::numeric(6,2) as points_diff,
    t.ph1::numeric(6,2) as points_h1,
    t.ph2::numeric(6,2) as points_h2,
    t.pb::numeric(6,2) as points_bonus,

    t.po_base::numeric(6,2)  as points_outcome_base,
    (t.po_total - t.po_base)::numeric(6,2) as points_outcome_bonus,

    t.pd_base::numeric(6,2)  as points_diff_base,
    (t.pd_total - t.pd_base)::numeric(6,2) as points_diff_bonus,

    now()
  from (
    select
      p.user_id,

      -- ИСХОД: база=2 если угадан, итого = база * outcome_mult
      (case
        when (v_home > v_away and p.home_pred > p.away_pred) then 2.0
        when (v_home = v_away and p.home_pred = p.away_pred) then 2.0
        when (v_home < v_away and p.home_pred < p.away_pred) then 2.0
        else 0.0
      end) as po_base,
      (case
        when (v_home > v_away and p.home_pred > p.away_pred) then 2.0 * v_outcome_mult
        when (v_home = v_away and p.home_pred = p.away_pred) then 2.0 * v_outcome_mult
        when (v_home < v_away and p.home_pred < p.away_pred) then 2.0 * v_outcome_mult
        else 0.0
      end) as po_total,

      -- РАЗНИЦА: база=1 если угадана, итого = база * diff_mult
      (case when (p.home_pred - p.away_pred) = (v_home - v_away) then 1.0 else 0.0 end) as pd_base,
      (case when (p.home_pred - p.away_pred) = (v_home - v_away) then 1.0 * v_diff_mult else 0.0 end) as pd_total,

      -- голы 1/2 команды
      (case when p.home_pred = v_home then 0.5 else 0.0 end) as ph1,
      (case when p.away_pred = v_away then 0.5 else 0.0 end) as ph2,

      -- бонус: суммарная ошибка ровно 1
      (case when (abs(p.home_pred - v_home) + abs(p.away_pred - v_away)) = 1 then 0.5 else 0.0 end) as pb
    from public.predictions p
    where p.match_id = p_match_id
  ) t;

end;
$$;


ALTER FUNCTION "public"."score_match_core"("p_match_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."score_match_debug"("p_match_id" bigint) RETURNS TABLE("user_id" "uuid", "match_id" bigint, "points" integer, "reason" "text")
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  -- без проверки admin: только для ручного вызова в SQL Editor
  return query
  select * from public.score_match(p_match_id);
end;
$$;


ALTER FUNCTION "public"."score_match_debug"("p_match_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_current_stage"("p_stage_id" bigint) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'admin only';
  end if;

  -- снимаем флаг со всех
  update public.stages set is_current = false where is_current = true;

  -- ставим выбранному
  update public.stages set is_current = true where id = p_stage_id;

  if not found then
    raise exception 'stage not found';
  end if;
end;
$$;


ALTER FUNCTION "public"."set_current_stage"("p_stage_id" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."analytics_stage_baseline" (
    "stage_id" bigint NOT NULL,
    "users_count" integer DEFAULT 0 NOT NULL,
    "mean_exact_rate" numeric DEFAULT 0 NOT NULL,
    "std_exact_rate" numeric DEFAULT 0 NOT NULL,
    "mean_draw_rate" numeric DEFAULT 0 NOT NULL,
    "std_draw_rate" numeric DEFAULT 0 NOT NULL,
    "mean_home_rate" numeric DEFAULT 0 NOT NULL,
    "std_home_rate" numeric DEFAULT 0 NOT NULL,
    "mean_away_rate" numeric DEFAULT 0 NOT NULL,
    "std_away_rate" numeric DEFAULT 0 NOT NULL,
    "mean_avg_total" numeric DEFAULT 0 NOT NULL,
    "std_avg_total" numeric DEFAULT 0 NOT NULL,
    "mean_absdiff_avg" numeric DEFAULT 0 NOT NULL,
    "std_absdiff_avg" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mean_outcome_hit_rate" numeric DEFAULT 0 NOT NULL,
    "std_outcome_hit_rate" numeric DEFAULT 0 NOT NULL,
    "mean_diff_hit_rate" numeric DEFAULT 0 NOT NULL,
    "std_diff_hit_rate" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."analytics_stage_baseline" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_stage_user" (
    "stage_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "matches_count" integer DEFAULT 0 NOT NULL,
    "pred_home_count" integer DEFAULT 0 NOT NULL,
    "pred_draw_count" integer DEFAULT 0 NOT NULL,
    "pred_away_count" integer DEFAULT 0 NOT NULL,
    "exact_count" integer DEFAULT 0 NOT NULL,
    "pred_total_sum" numeric DEFAULT 0 NOT NULL,
    "pred_absdiff_sum" numeric DEFAULT 0 NOT NULL,
    "pred_bigdiff_count" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "outcome_hit_count" integer DEFAULT 0 NOT NULL,
    "diff_hit_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."analytics_stage_user" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_stage_user_archetype" (
    "stage_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "archetype_key" "text" NOT NULL,
    "title_ru" "text" NOT NULL,
    "summary_ru" "text" NOT NULL,
    "reasons_ru" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "state" "text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analytics_stage_user_archetype" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."analytics_stage_user_momentum" (
    "stage_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "n" integer DEFAULT 5 NOT NULL,
    "k" integer DEFAULT 10 NOT NULL,
    "matches_count" integer DEFAULT 0 NOT NULL,
    "points_series" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "momentum_series" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "momentum_current" numeric DEFAULT 0 NOT NULL,
    "avg_last_n" numeric DEFAULT 0 NOT NULL,
    "avg_all" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."analytics_stage_user_momentum" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" bigint NOT NULL,
    "actor_user_id" "uuid",
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "text",
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."audit_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."audit_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."audit_log_id_seq" OWNED BY "public"."audit_log"."id";



CREATE TABLE IF NOT EXISTS "public"."import_rpl_matches" (
    "competition" "text",
    "season" "text",
    "tour" integer NOT NULL,
    "kickoff_at_msk" timestamp with time zone,
    "kickoff_at_utc" timestamp with time zone NOT NULL,
    "home_team" "text" NOT NULL,
    "away_team" "text" NOT NULL
);


ALTER TABLE "public"."import_rpl_matches" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."login_accounts" (
    "login" "text" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "must_change_password" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "temp_password" "text"
);


ALTER TABLE "public"."login_accounts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."match_scores" (
    "match_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "points" numeric(10,2) NOT NULL,
    "calculated_at" timestamp without time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."match_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" bigint NOT NULL,
    "tournament_id" bigint,
    "home_team_id" bigint NOT NULL,
    "away_team_id" bigint NOT NULL,
    "kickoff_at" timestamp with time zone NOT NULL,
    "deadline_at" timestamp with time zone NOT NULL,
    "status" "text" DEFAULT 'scheduled'::"text" NOT NULL,
    "home_score" integer,
    "away_score" integer,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "stage_id" bigint,
    "tour_id" bigint,
    "stage_match_no" integer,
    CONSTRAINT "matches_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'live'::"text", 'finished'::"text", 'canceled'::"text"])))
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."matches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."matches_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."matches_id_seq" OWNED BY "public"."matches"."id";



CREATE TABLE IF NOT EXISTS "public"."points_ledger" (
    "id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "match_id" bigint NOT NULL,
    "points" numeric(6,2) NOT NULL,
    "reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "points_outcome" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_diff" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_h1" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_h2" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_bonus" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_outcome_base" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_outcome_bonus" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_diff_base" numeric(6,2) DEFAULT 0 NOT NULL,
    "points_diff_bonus" numeric(6,2) DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."points_ledger" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."points_ledger_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."points_ledger_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."points_ledger_id_seq" OWNED BY "public"."points_ledger"."id";



CREATE TABLE IF NOT EXISTS "public"."prediction_scores" (
    "prediction_id" bigint NOT NULL,
    "match_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "total" numeric(6,2) NOT NULL,
    "team_goals" numeric(6,2) NOT NULL,
    "outcome" numeric(6,2) NOT NULL,
    "diff" numeric(6,2) NOT NULL,
    "near_bonus" numeric(6,2) NOT NULL,
    "outcome_guessed" integer NOT NULL,
    "outcome_mult" numeric(6,2) NOT NULL,
    "diff_guessed" integer NOT NULL,
    "diff_mult" numeric(6,2) NOT NULL,
    "pred_text" "text" NOT NULL,
    "res_text" "text" NOT NULL,
    "rule_version" "text" DEFAULT 'v1'::"text" NOT NULL,
    "computed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prediction_scores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."predictions" (
    "id" bigint NOT NULL,
    "match_id" bigint NOT NULL,
    "user_id" "uuid" NOT NULL,
    "home_pred" integer NOT NULL,
    "away_pred" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "predictions_away_pred_check" CHECK ((("away_pred" >= 0) AND ("away_pred" <= 30))),
    CONSTRAINT "predictions_home_pred_check" CHECK ((("home_pred" >= 0) AND ("home_pred" <= 30)))
);


ALTER TABLE "public"."predictions" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."predictions_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."predictions_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."predictions_id_seq" OWNED BY "public"."predictions"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "avatar_url" "text",
    "role" "text" DEFAULT 'user'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "profiles_role_check" CHECK (("role" = ANY (ARRAY['user'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stages" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "matches_required" integer DEFAULT 56 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_current" boolean DEFAULT false NOT NULL,
    CONSTRAINT "stages_matches_required_check" CHECK (("matches_required" = 56)),
    CONSTRAINT "stages_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'published'::"text", 'locked'::"text"])))
);


ALTER TABLE "public"."stages" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."stages_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."stages_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."stages_id_seq" OWNED BY "public"."stages"."id";



CREATE TABLE IF NOT EXISTS "public"."teams" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL
);


ALTER TABLE "public"."teams" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."teams_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."teams_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."teams_id_seq" OWNED BY "public"."teams"."id";



CREATE TABLE IF NOT EXISTS "public"."telegram_broadcast_log" (
    "id" bigint NOT NULL,
    "match_id" bigint NOT NULL,
    "bucket" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."telegram_broadcast_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."telegram_broadcast_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."telegram_broadcast_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."telegram_broadcast_log_id_seq" OWNED BY "public"."telegram_broadcast_log"."id";



CREATE TABLE IF NOT EXISTS "public"."tournaments" (
    "id" bigint NOT NULL,
    "name" "text" NOT NULL,
    "slug" "text" NOT NULL
);


ALTER TABLE "public"."tournaments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tournaments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tournaments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tournaments_id_seq" OWNED BY "public"."tournaments"."id";



CREATE TABLE IF NOT EXISTS "public"."tours" (
    "id" bigint NOT NULL,
    "stage_id" bigint NOT NULL,
    "tour_no" integer NOT NULL,
    "name" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tours_tour_no_check" CHECK (("tour_no" >= 1))
);


ALTER TABLE "public"."tours" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."tours_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."tours_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."tours_id_seq" OWNED BY "public"."tours"."id";



ALTER TABLE ONLY "public"."audit_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."audit_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."matches" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."matches_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."points_ledger" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."points_ledger_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."predictions" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."predictions_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."stages" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."stages_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."teams" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."teams_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."telegram_broadcast_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."telegram_broadcast_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tournaments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tournaments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."tours" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."tours_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."analytics_stage_baseline"
    ADD CONSTRAINT "analytics_stage_baseline_pkey" PRIMARY KEY ("stage_id");



ALTER TABLE ONLY "public"."analytics_stage_user_archetype"
    ADD CONSTRAINT "analytics_stage_user_archetype_pk" PRIMARY KEY ("stage_id", "user_id");



ALTER TABLE ONLY "public"."analytics_stage_user_momentum"
    ADD CONSTRAINT "analytics_stage_user_momentum_pkey" PRIMARY KEY ("stage_id", "user_id");



ALTER TABLE ONLY "public"."analytics_stage_user"
    ADD CONSTRAINT "analytics_stage_user_pk" PRIMARY KEY ("stage_id", "user_id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."login_accounts"
    ADD CONSTRAINT "login_accounts_pkey" PRIMARY KEY ("login");



ALTER TABLE ONLY "public"."login_accounts"
    ADD CONSTRAINT "login_accounts_user_id_key" UNIQUE ("user_id");



ALTER TABLE ONLY "public"."match_scores"
    ADD CONSTRAINT "match_scores_pkey" PRIMARY KEY ("match_id", "user_id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."points_ledger"
    ADD CONSTRAINT "points_ledger_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prediction_scores"
    ADD CONSTRAINT "prediction_scores_pkey" PRIMARY KEY ("prediction_id");



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."stages"
    ADD CONSTRAINT "stages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teams"
    ADD CONSTRAINT "teams_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."telegram_broadcast_log"
    ADD CONSTRAINT "telegram_broadcast_log_match_bucket_key" UNIQUE ("match_id", "bucket");



ALTER TABLE ONLY "public"."telegram_broadcast_log"
    ADD CONSTRAINT "telegram_broadcast_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournaments"
    ADD CONSTRAINT "tournaments_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_stage_id_tour_no_key" UNIQUE ("stage_id", "tour_no");



CREATE INDEX "idx_audit_actor" ON "public"."audit_log" USING "btree" ("actor_user_id");



CREATE INDEX "idx_audit_created_at" ON "public"."audit_log" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_matches_deadline" ON "public"."matches" USING "btree" ("deadline_at");



CREATE INDEX "idx_matches_kickoff" ON "public"."matches" USING "btree" ("kickoff_at");



CREATE INDEX "idx_matches_stage" ON "public"."matches" USING "btree" ("stage_id");



CREATE INDEX "idx_matches_tour" ON "public"."matches" USING "btree" ("tour_id");



CREATE INDEX "idx_points_match" ON "public"."points_ledger" USING "btree" ("match_id");



CREATE INDEX "idx_points_user" ON "public"."points_ledger" USING "btree" ("user_id");



CREATE INDEX "idx_predictions_match" ON "public"."predictions" USING "btree" ("match_id");



CREATE INDEX "idx_predictions_user" ON "public"."predictions" USING "btree" ("user_id");



CREATE INDEX "idx_tours_stage" ON "public"."tours" USING "btree" ("stage_id");



CREATE INDEX "matches_stage_tour_idx" ON "public"."matches" USING "btree" ("stage_id", "tour_id");



CREATE UNIQUE INDEX "matches_unique_stage_pair_kickoff" ON "public"."matches" USING "btree" ("stage_id", "home_team_id", "away_team_id", "kickoff_at");



CREATE INDEX "points_ledger_match_user_idx" ON "public"."points_ledger" USING "btree" ("match_id", "user_id");



CREATE INDEX "prediction_scores_match_id_idx" ON "public"."prediction_scores" USING "btree" ("match_id");



CREATE INDEX "prediction_scores_user_id_idx" ON "public"."prediction_scores" USING "btree" ("user_id");



CREATE INDEX "predictions_match_user_idx" ON "public"."predictions" USING "btree" ("match_id", "user_id");



CREATE UNIQUE INDEX "predictions_user_match_uniq" ON "public"."predictions" USING "btree" ("user_id", "match_id");



CREATE INDEX "telegram_broadcast_log_created_at_idx" ON "public"."telegram_broadcast_log" USING "btree" ("created_at" DESC);



CREATE UNIQUE INDEX "telegram_broadcast_log_match_bucket_uq" ON "public"."telegram_broadcast_log" USING "btree" ("match_id", "bucket");



CREATE INDEX "telegram_broadcast_log_match_id_idx" ON "public"."telegram_broadcast_log" USING "btree" ("match_id");



CREATE UNIQUE INDEX "uq_matches_stage_match_no" ON "public"."matches" USING "btree" ("stage_id", "stage_match_no");



CREATE UNIQUE INDEX "uq_matches_unique_game" ON "public"."matches" USING "btree" ("tournament_id", "home_team_id", "away_team_id", "kickoff_at");



CREATE UNIQUE INDEX "uq_predictions_match_user" ON "public"."predictions" USING "btree" ("match_id", "user_id");



CREATE UNIQUE INDEX "uq_stages_only_one_current" ON "public"."stages" USING "btree" ("is_current") WHERE ("is_current" = true);



CREATE OR REPLACE TRIGGER "trg_assign_stage_match_no" BEFORE INSERT ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."assign_stage_match_no"();



CREATE OR REPLACE TRIGGER "trg_audit_matches_delete" AFTER DELETE ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."audit_matches_delete"();



CREATE OR REPLACE TRIGGER "trg_audit_matches_insert" AFTER INSERT ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."audit_matches_insert"();



CREATE OR REPLACE TRIGGER "trg_audit_matches_update" AFTER UPDATE ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."audit_matches_update"();



CREATE OR REPLACE TRIGGER "trg_block_match_delete" BEFORE DELETE ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."block_match_write_when_stage_locked"();



CREATE OR REPLACE TRIGGER "trg_block_match_insert" BEFORE INSERT ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."block_match_write_when_stage_locked"();



CREATE OR REPLACE TRIGGER "trg_block_match_move" BEFORE UPDATE OF "stage_id", "tour_id" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."block_match_move_when_stage_locked"();



CREATE OR REPLACE TRIGGER "trg_enforce_match_stage" BEFORE INSERT OR UPDATE OF "tour_id", "stage_id" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."enforce_match_stage"();



CREATE OR REPLACE TRIGGER "trg_predictions_updated" BEFORE UPDATE ON "public"."predictions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "trg_prevent_role_change" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_role_change"();



CREATE OR REPLACE TRIGGER "trg_prevent_team_duplicate_in_tour" BEFORE INSERT OR UPDATE OF "home_team_id", "away_team_id", "tour_id" ON "public"."matches" FOR EACH ROW EXECUTE FUNCTION "public"."prevent_team_duplicate_in_tour"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."login_accounts"
    ADD CONSTRAINT "login_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_away_team_id_fkey" FOREIGN KEY ("away_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_home_team_id_fkey" FOREIGN KEY ("home_team_id") REFERENCES "public"."teams"("id");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "public"."tours"("id") ON DELETE RESTRICT;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."points_ledger"
    ADD CONSTRAINT "points_ledger_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."points_ledger"
    ADD CONSTRAINT "points_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prediction_scores"
    ADD CONSTRAINT "prediction_scores_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prediction_scores"
    ADD CONSTRAINT "prediction_scores_prediction_id_fkey" FOREIGN KEY ("prediction_id") REFERENCES "public"."predictions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."prediction_scores"
    ADD CONSTRAINT "prediction_scores_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."predictions"
    ADD CONSTRAINT "predictions_user_id_profiles_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."telegram_broadcast_log"
    ADD CONSTRAINT "telegram_broadcast_log_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tours"
    ADD CONSTRAINT "tours_stage_id_fkey" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE CASCADE;



CREATE POLICY "admin_read_all_prediction_scores" ON "public"."prediction_scores" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



CREATE POLICY "admin_read_all_scores" ON "public"."prediction_scores" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles" "p"
  WHERE (("p"."id" = "auth"."uid"()) AND ("p"."role" = 'admin'::"text")))));



ALTER TABLE "public"."analytics_stage_baseline" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_stage_baseline_select_public" ON "public"."analytics_stage_baseline" FOR SELECT USING (true);



ALTER TABLE "public"."analytics_stage_user" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."analytics_stage_user_archetype" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "analytics_stage_user_archetype_select_public" ON "public"."analytics_stage_user_archetype" FOR SELECT USING (true);



CREATE POLICY "analytics_stage_user_select_public" ON "public"."analytics_stage_user" FOR SELECT USING (true);



CREATE POLICY "audit_insert_admin" ON "public"."audit_log" FOR INSERT TO "authenticated" WITH CHECK (false);



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_select_admin" ON "public"."audit_log" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



ALTER TABLE "public"."login_accounts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "login_accounts_select_all" ON "public"."login_accounts" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "login_accounts_update_own" ON "public"."login_accounts" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."matches" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "matches_admin_write" ON "public"."matches" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "matches_select_all" ON "public"."matches" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "matches_select_current_stage" ON "public"."matches" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."stages" "s"
  WHERE (("s"."id" = "matches"."stage_id") AND ("s"."is_current" = true)))));



CREATE POLICY "points_admin_write" ON "public"."points_ledger" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



ALTER TABLE "public"."points_ledger" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "points_ledger_select_current_stage" ON "public"."points_ledger" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."matches" "m"
     JOIN "public"."stages" "s" ON (("s"."id" = "m"."stage_id")))
  WHERE (("m"."id" = "points_ledger"."match_id") AND ("s"."is_current" = true)))));



CREATE POLICY "points_select_own" ON "public"."points_ledger" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."prediction_scores" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."predictions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "predictions_insert_own_before_deadline" ON "public"."predictions" FOR INSERT TO "authenticated" WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."matches" "m"
     JOIN "public"."stages" "s" ON (("s"."id" = "m"."stage_id")))
  WHERE (("m"."id" = "predictions"."match_id") AND ("s"."is_current" = true) AND ("now"() < "m"."deadline_at"))))));



CREATE POLICY "predictions_select_admin_all" ON "public"."predictions" FOR SELECT TO "authenticated" USING ("public"."is_admin"());



CREATE POLICY "predictions_select_after_deadline" ON "public"."predictions" FOR SELECT TO "authenticated", "anon" USING ((EXISTS ( SELECT 1
   FROM "public"."matches" "m"
  WHERE (("m"."id" = "predictions"."match_id") AND ("now"() >= "m"."deadline_at")))));



CREATE POLICY "predictions_select_current_stage" ON "public"."predictions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."matches" "m"
     JOIN "public"."stages" "s" ON (("s"."id" = "m"."stage_id")))
  WHERE (("m"."id" = "predictions"."match_id") AND ("s"."is_current" = true)))));



CREATE POLICY "predictions_select_own" ON "public"."predictions" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "predictions_update_own_before_deadline" ON "public"."predictions" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"())) WITH CHECK ((("user_id" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM ("public"."matches" "m"
     JOIN "public"."stages" "s" ON (("s"."id" = "m"."stage_id")))
  WHERE (("m"."id" = "predictions"."match_id") AND ("s"."is_current" = true) AND ("now"() < "m"."deadline_at"))))));



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_select_all" ON "public"."profiles" FOR SELECT TO "authenticated", "anon" USING (true);



CREATE POLICY "profiles_update_own" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



CREATE POLICY "read_own_prediction_scores" ON "public"."prediction_scores" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "read_own_scores" ON "public"."prediction_scores" FOR SELECT USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."stages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stages_admin_write" ON "public"."stages" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "stages_select_all" ON "public"."stages" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."teams" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teams_admin_write" ON "public"."teams" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "teams_select_all" ON "public"."teams" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."telegram_broadcast_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournaments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tournaments_admin_write" ON "public"."tournaments" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "tournaments_select_all" ON "public"."tournaments" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."tours" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tours_admin_write" ON "public"."tours" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "tours_select_all" ON "public"."tours" FOR SELECT TO "authenticated", "anon" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."assign_stage_match_no"() TO "anon";
GRANT ALL ON FUNCTION "public"."assign_stage_match_no"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_stage_match_no"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_matches_delete"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_matches_delete"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_matches_delete"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_matches_insert"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_matches_insert"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_matches_insert"() TO "service_role";



GRANT ALL ON FUNCTION "public"."audit_matches_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_matches_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_matches_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_match_move_when_stage_locked"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_match_move_when_stage_locked"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_match_move_when_stage_locked"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_match_move_when_stage_not_draft"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_match_move_when_stage_not_draft"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_match_move_when_stage_not_draft"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_match_write_when_stage_locked"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_match_write_when_stage_locked"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_match_write_when_stage_locked"() TO "service_role";



GRANT ALL ON FUNCTION "public"."block_match_write_when_stage_not_draft"() TO "anon";
GRANT ALL ON FUNCTION "public"."block_match_write_when_stage_not_draft"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."block_match_write_when_stage_not_draft"() TO "service_role";



GRANT ALL ON FUNCTION "public"."enforce_match_stage"() TO "anon";
GRANT ALL ON FUNCTION "public"."enforce_match_stage"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."enforce_match_stage"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_leaderboard"("p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_leaderboard"("p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_leaderboard"("p_limit" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."lock_stage"("p_stage_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."lock_stage"("p_stage_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."lock_stage"("p_stage_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_role_change"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_role_change"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_role_change"() TO "service_role";



GRANT ALL ON FUNCTION "public"."prevent_team_duplicate_in_tour"() TO "anon";
GRANT ALL ON FUNCTION "public"."prevent_team_duplicate_in_tour"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."prevent_team_duplicate_in_tour"() TO "service_role";



GRANT ALL ON FUNCTION "public"."publish_stage"("p_stage_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."publish_stage"("p_stage_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."publish_stage"("p_stage_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_stage_analytics"("p_stage_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_stage_analytics"("p_stage_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_stage_analytics"("p_stage_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."recalculate_stage_momentum"("p_stage_id" bigint, "p_n" integer, "p_k" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."recalculate_stage_momentum"("p_stage_id" bigint, "p_n" integer, "p_k" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."recalculate_stage_momentum"("p_stage_id" bigint, "p_n" integer, "p_k" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."score_match"("p_match_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."score_match"("p_match_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."score_match"("p_match_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."score_match_core"("p_match_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."score_match_core"("p_match_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."score_match_core"("p_match_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."score_match_debug"("p_match_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."score_match_debug"("p_match_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."score_match_debug"("p_match_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_current_stage"("p_stage_id" bigint) TO "anon";
GRANT ALL ON FUNCTION "public"."set_current_stage"("p_stage_id" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_current_stage"("p_stage_id" bigint) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";


















GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_stage_baseline" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_stage_baseline" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_stage_baseline" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_stage_user" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_stage_user" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_stage_user" TO "service_role";



GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_stage_user_archetype" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."analytics_stage_user_archetype" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_stage_user_archetype" TO "service_role";



GRANT ALL ON TABLE "public"."analytics_stage_user_momentum" TO "anon";
GRANT ALL ON TABLE "public"."analytics_stage_user_momentum" TO "authenticated";
GRANT ALL ON TABLE "public"."analytics_stage_user_momentum" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."import_rpl_matches" TO "anon";
GRANT ALL ON TABLE "public"."import_rpl_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."import_rpl_matches" TO "service_role";



GRANT ALL ON TABLE "public"."login_accounts" TO "anon";
GRANT ALL ON TABLE "public"."login_accounts" TO "authenticated";
GRANT ALL ON TABLE "public"."login_accounts" TO "service_role";



GRANT ALL ON TABLE "public"."match_scores" TO "anon";
GRANT ALL ON TABLE "public"."match_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."match_scores" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."points_ledger" TO "anon";
GRANT ALL ON TABLE "public"."points_ledger" TO "authenticated";
GRANT ALL ON TABLE "public"."points_ledger" TO "service_role";



GRANT ALL ON SEQUENCE "public"."points_ledger_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."points_ledger_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."points_ledger_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."prediction_scores" TO "anon";
GRANT ALL ON TABLE "public"."prediction_scores" TO "authenticated";
GRANT ALL ON TABLE "public"."prediction_scores" TO "service_role";



GRANT ALL ON TABLE "public"."predictions" TO "anon";
GRANT ALL ON TABLE "public"."predictions" TO "authenticated";
GRANT ALL ON TABLE "public"."predictions" TO "service_role";



GRANT ALL ON SEQUENCE "public"."predictions_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."predictions_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."predictions_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."stages" TO "anon";
GRANT ALL ON TABLE "public"."stages" TO "authenticated";
GRANT ALL ON TABLE "public"."stages" TO "service_role";



GRANT ALL ON SEQUENCE "public"."stages_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."stages_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."stages_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."teams" TO "anon";
GRANT ALL ON TABLE "public"."teams" TO "authenticated";
GRANT ALL ON TABLE "public"."teams" TO "service_role";



GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."teams_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."telegram_broadcast_log" TO "anon";
GRANT ALL ON TABLE "public"."telegram_broadcast_log" TO "authenticated";
GRANT ALL ON TABLE "public"."telegram_broadcast_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."telegram_broadcast_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."telegram_broadcast_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."telegram_broadcast_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tournaments" TO "anon";
GRANT ALL ON TABLE "public"."tournaments" TO "authenticated";
GRANT ALL ON TABLE "public"."tournaments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tournaments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tournaments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tournaments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."tours" TO "anon";
GRANT ALL ON TABLE "public"."tours" TO "authenticated";
GRANT ALL ON TABLE "public"."tours" TO "service_role";



GRANT ALL ON SEQUENCE "public"."tours_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."tours_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."tours_id_seq" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































