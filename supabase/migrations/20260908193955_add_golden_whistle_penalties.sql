alter table public.matches
  add column if not exists home_penalty_goals integer not null default 0,
  add column if not exists away_penalty_goals integer not null default 0;

alter table public.matches
  drop constraint if exists matches_home_penalty_goals_check,
  add constraint matches_home_penalty_goals_check
    check (home_penalty_goals >= 0 and (home_score is null or home_penalty_goals <= home_score)),
  drop constraint if exists matches_away_penalty_goals_check,
  add constraint matches_away_penalty_goals_check
    check (away_penalty_goals >= 0 and (away_score is null or away_penalty_goals <= away_score));
