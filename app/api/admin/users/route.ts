import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/* ================== helpers ================== */

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function genTempPassword() {
  return Math.random().toString(36).slice(-8);
}

function getServiceSupabase() {
  return createAdminClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

async function readLogin() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  return { rawLogin, fpLogin };
}

async function requireAdmin() {
  const { rawLogin, fpLogin } = await readLogin();
  if (!fpLogin) {
    return {
      ok: false as const,
      res: NextResponse.json(
        { ok: false, error: "not_auth", where: "cookies", rawLogin, fpLogin },
        { status: 401 }
      ),
    };
  }

  const svc = getServiceSupabase();

  const { data: acc, error: accErr } = await svc
    .from("login_accounts")
    .select("user_id")
    .eq("login", fpLogin)
    .maybeSingle();

  if (accErr) return { ok: false as const, res: NextResponse.json({ ok: false, error: accErr.message }, { status: 500 }) };
  if (!acc?.user_id) {
    return {
      ok: false as const,
      res: NextResponse.json(
        { ok: false, error: "not_auth", where: "login_accounts", rawLogin, fpLogin },
        { status: 401 }
      ),
    };
  }

  const { data: profile, error: profErr } = await svc
    .from("profiles")
    .select("role")
    .eq("id", acc.user_id)
    .maybeSingle();

  if (profErr) return { ok: false as const, res: NextResponse.json({ ok: false, error: profErr.message }, { status: 500 }) };

  if (profile?.role !== "admin") {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }) };
  }

  return { ok: true as const, user_id: acc.user_id };
}

/* ================== GET ================== */

export async function GET() {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const svc = getServiceSupabase();

  const { data, error } = await svc
    .from("login_accounts")
    .select("login,user_id,must_change_password,profiles:profiles(role,username)")
    .order("login", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, users: data ?? [] });
}

/* ================== POST ================== */

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const login = String(body.login ?? "").trim();
  const role = body.role === "admin" ? "admin" : "user";

  if (!login) return NextResponse.json({ ok: false, error: "login_required" }, { status: 400 });

  const password = String(body.password ?? "").trim() || genTempPassword();
  if (password.length < 6) return NextResponse.json({ ok: false, error: "password_too_short" }, { status: 400 });

  const svc = getServiceSupabase();
  const email = `${login.toLowerCase()}.${Date.now()}@local.invalid`;

  const created = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { login },
  });

  if (created.error || !created.data.user) {
    return NextResponse.json({ ok: false, error: created.error?.message ?? "create_auth_failed" }, { status: 400 });
  }

  const userId = created.data.user.id;

  const { error: pErr } = await svc.from("profiles").insert({ id: userId, username: login, role });
  if (pErr) {
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ ok: false, error: pErr.message }, { status: 400 });
  }

  const { error: aErr } = await svc.from("login_accounts").insert({
    user_id: userId,
    login,
    must_change_password: true,
    temp_password: password,
  });

  if (aErr) {
    try {
      await svc.from("profiles").delete().eq("id", userId);
    } catch {}
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ ok: false, error: aErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, tempPassword: password });
}

/* ================== PATCH ================== */

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? "").trim();
  if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });

  const svc = getServiceSupabase();

  // смена логина
  if (body.login !== undefined) {
    const login = String(body.login).trim();
    if (!login) return NextResponse.json({ ok: false, error: "login_empty" }, { status: 400 });

    const { error: e1 } = await svc.from("login_accounts").update({ login }).eq("user_id", userId);
    if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 });

    const { error: e2 } = await svc.from("profiles").update({ username: login }).eq("id", userId);
    if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 400 });
  }

  // смена роли
  if (body.role !== undefined) {
    const role = body.role === "admin" ? "admin" : "user";
    const { error } = await svc.from("profiles").update({ role }).eq("id", userId);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  // сброс пароля
  if (body.reset_password === true) {
    const tempPassword = genTempPassword();

    const upd = await svc.auth.admin.updateUserById(userId, { password: tempPassword });
    if (upd.error) return NextResponse.json({ ok: false, error: upd.error.message }, { status: 400 });

    const { error } = await svc
      .from("login_accounts")
      .update({ must_change_password: true, temp_password: tempPassword })
      .eq("user_id", userId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, tempPassword });
  }

  return NextResponse.json({ ok: true });
}

/* ================== DELETE ================== */

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? "").trim();
  if (!userId) return NextResponse.json({ ok: false, error: "user_id_required" }, { status: 400 });

  const svc = getServiceSupabase();

  try {
    await svc.from("login_accounts").delete().eq("user_id", userId);
  } catch {}

  try {
    await svc.from("profiles").delete().eq("id", userId);
  } catch {}

  const del = await svc.auth.admin.deleteUser(userId);
  if (del.error) return NextResponse.json({ ok: false, error: del.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}