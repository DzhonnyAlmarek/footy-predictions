# RLS правила (кратко)

## login_accounts
- user может читать только свою строку
- user может обновлять только свою строку (must_change_password)
- admin — полный доступ

## predictions
- user может upsert только свои прогнозы
- user может читать прогнозы всех для текущего этапа

## points_ledger
- user может читать очки всех для текущего этапа
- только admin может вставлять/обновлять

## matches / tours / stages
- user: select только
- admin: полный доступ
