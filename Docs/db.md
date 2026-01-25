# Структура базы данных

## login_accounts
- id
- login (уникальный)
- user_id (auth.users)
- must_change_password (boolean)
- role (admin | user)

## profiles
- id (auth.users)
- display_name

## stages
- id
- name
- status (draft | published | locked)
- is_current (boolean)

## tours
- id
- stage_id
- tour_no
- name

## matches
- id
- stage_id
- tour_id
- stage_match_no (1–56)
- home_team_id
- away_team_id
- kickoff_at
- deadline_at
- home_score
- away_score

## predictions
- id
- user_id
- match_id
- home_pred
- away_pred

## points_ledger
- id
- user_id
- match_id
- points

## teams
- id
- name
