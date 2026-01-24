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

const login = "ADMIN";
const email = "admin@local";
const password = "12345";

async function main() {
  // найти/создать auth user
  let user = null;
  let page = 1;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    user = data.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());
    if (user) break;
    if (data.users.length < 200) break;
    page += 1;
  }

  if (!user) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { login },
    });
    if (createErr) throw createErr;
    user = created.user;
    console.log(`User created: ${login} -> ${email} -> ${user.id}`);
  } else {
    console.log(`User exists: ${login} -> ${email} -> ${user.id}`);
  }

  // login_accounts
  const { error: linkErr } = await supabase
    .from("login_accounts")
    .upsert({ login, user_id: user.id, must_change_password: true }, { onConflict: "login" });
  if (linkErr) throw linkErr;

  // profiles: username + role=admin
  const { error: profErr } = await supabase
    .from("profiles")
    .upsert({ id: user.id, username: login, role: "admin" }, { onConflict: "id" });
  if (profErr) throw profErr;

  console.log("✅ ADMIN added (must_change_password=true, role=admin)");
}

main().catch((e) => {
  console.error("❌ fix-admin failed:", e);
  process.exit(1);
});
