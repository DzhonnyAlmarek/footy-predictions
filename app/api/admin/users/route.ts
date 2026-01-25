import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";

/* ================== helpers ================== */

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function getServiceSupabase() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}

async function getAuthedSupabase() {
  const cookieStore = cookies();

  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          /* не нужно */
        },
      },
    }
  );
}

async function requireAdmin() {
  const supabase = await getAuthedSupabase();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return { ok: false, res: NextResponse.json({ error: "not_auth" }, { status: 401 }) };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profile?.role !== "admin") {
    return { ok: false, res: NextResponse.json({ error: "admin_only" }, { status: 403 }) };
  }

  return { ok: true };
}

/* ================== POST: create user ================== */

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const login = String(body.login ?? "").trim();
  const role = body.role === "admin" ? "admin" : "user";
  const password = String(body.password ?? "12345");

  if (!login) {
    return NextResponse.json({ error: "login_required" }, { status: 400 });
  }
  if (password.length < 5) {
    return NextResponse.json({ error: "password_too_short" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // технический email (не используется пользователем)
  const email = `${login.toLowerCase()}.${Date.now()}@local.invalid`;

  const created = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { login },
  });

  if (created.error || !created.data.user) {
    return NextResponse.json(
      { error: created.error?.message ?? "create_auth_failed" },
      { status: 400 }
    );
  }

  const userId = created.data.user.id;

  // profiles
  const { error: pErr } = await svc
    .from("profiles")
    .insert({ id: userId, username: login, role });

  if (pErr) {
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: pErr.message }, { status: 400 });
  }

  // login_accounts
  const { error: aErr } = await svc
    .from("login_accounts")
    .insert({
      user_id: userId,
      login,
      must_change_password: true,
    });

  if (aErr) {
    await svc.from("profiles").delete().eq("id", userId).catch(() => {});
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: aErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/* ================== PATCH: update user ================== */

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? "").trim();

  if (!userId) {
    return NextResponse.json({ error: "user_id_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // смена логина
  if (body.login !== undefined) {
    const login = String(body.login).trim();
    if (!login) {
      return NextResponse.json({ error: "login_empty" }, { status: 400 });
    }

    const { error: e1 } = await svc
      .from("login_accounts")
      .update({ login })
      .eq("user_id", userId);

    if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

    const { error: e2 } = await svc
      .from("profiles")
      .update({ username: login })
      .eq("id", userId);

    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
  }

  // смена роли
  if (body.role !== undefined) {
    const role = body.role === "admin" ? "admin" : "user";

    const { error } = await svc
      .from("profiles")
      .update({ role })
      .eq("id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // сброс пароля
  if (body.reset_password === true) {
    const upd = await svc.auth.admin.updateUserById(userId, {
      password: "12345",
    });

    if (upd.error) {
      return NextResponse.json({ error: upd.error.message }, { status: 400 });
    }

    const { error } = await svc
      .from("login_accounts")
      .update({ must_change_password: true })
      .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

/* ================== DELETE: delete user ================== */

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? "").trim();

  if (!userId) {
    return NextResponse.json({ error: "user_id_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // удалить прикладные данные
  await svc.from("login_accounts").delete().eq("user_id", userId).catch(() => {});
  await svc.from("profiles").delete().eq("id", userId).catch(() => {});

  // удалить auth
  const del = await svc.auth.admin.deleteUser(userId);
  if (del.error) {
    return NextResponse.json({ error: del.error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
