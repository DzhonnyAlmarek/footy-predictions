import "dotenv/config";

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Логины, которые увидит пользователь в выпадающем списке
const LOGINS = ["СВС", "АМН", "КДЛ", "БАА", "КЕН"];

// Технические email (в UI НЕ показываем вообще)
function techEmail(login) {
  const map = {
    "СВС": "cvs",
    "АМН": "amn",
    "КДЛ": "kdl",
    "БАА": "baa",
    "КЕН": "ken",
  };
  return `${map[login]}@local`;
}

async function main() {
  const defaultPassword = "12345";

  for (const login of LOGINS) {
    const email = techEmail(login);

    // 1) Создаём (или находим) пользователя в Auth
    // Пробуем создать — если уже существует, просто найдём по email
    let userId = null;

    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password: defaultPassword,
      email_confirm: true,
      user_metadata: { login }, // не обязательно, но удобно
    });

    if (createErr) {
      // Если пользователь уже существует — получим его id через listUsers
      // (Supabase не всегда возвращает "user already exists" одинаково)
      const { data: list, error: listErr } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });

      if (listErr) throw listErr;

      const found = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
      if (!found) {
        throw createErr;
      }
      userId = found.id;
      console.log(`User exists: ${login} -> ${email} -> ${userId}`);
    } else {
      userId = created.user.id;
      console.log(`User created: ${login} -> ${email} -> ${userId}`);
    }

    // 2) Привязка логина к user_id + флаг смены пароля
    const { error: linkErr } = await supabase
      .from("login_accounts")
      .upsert({ login, user_id: userId, must_change_password: true }, { onConflict: "login" });

    if (linkErr) throw linkErr;

    // 3) Заполним profiles.username = login (чтобы в списках было красиво)
    // trigger мог создать profiles, но username мог быть null — проставляем
    const { error: profErr } = await supabase
      .from("profiles")
      .update({ username: login })
      .eq("id", userId);

    if (profErr) throw profErr;
  }

  console.log("✅ Done. Logins seeded with default password 12345 and must_change_password=true");
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});
