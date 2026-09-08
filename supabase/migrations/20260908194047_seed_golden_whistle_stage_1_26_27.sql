with penalty_data(stage_match_no, home_penalty_goals, away_penalty_goals) as (
  values
    (10,1,0),(13,1,0),(15,0,1),(26,0,1),(30,1,0),(32,1,0),
    (41,1,0),(42,0,1),(46,0,1),(48,0,1),(55,1,0),(56,0,1)
), target_stage as (
  select id from public.stages where name = 'Этап 1 ЧР 26-27'
)
update public.matches m
set home_penalty_goals = p.home_penalty_goals,
    away_penalty_goals = p.away_penalty_goals
from penalty_data p, target_stage s
where m.stage_id = s.id and m.stage_match_no = p.stage_match_no;
