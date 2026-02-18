import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";

/* ================== helpers ================== */

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

async function requireAdmin() {
  const cs = await cookies();
  const raw = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(raw).trim().toUpperCase();

  if (fpLogin !== "ADMIN") {
    return { ok: false, res: NextResponse.json({ error: "not_auth" }, { status: 401 }) };
  }
  return { ok: true as const };
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

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ users: data ?? [] });
}

/* ================== POST ================== */

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const login = String(body.login ?? "").trim();
  const role = body.role === "admin" ? "admin" : "user";

  if (!login) return NextResponse.json({ error: "login_required" }, { status: 400 });

  const password = String(body.password ?? "").trim() || genTempPassword();
  if (password.length < 6) return NextResponse.json({ error: "password_too_short" }, { status: 400 });

  const svc = getServiceSupabase();
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

  const { error: pErr } = await svc.from("profiles").insert({ id: userId, username: login, role });
  if (pErr) {
    await svc.auth.admin.deleteUser(userId).catch(() => {});
    return NextResponse.json({ error: pErr.message }, { status: 400 });
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
    return NextResponse.json({ error: aErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, tempPassword: password });
}

/* ================== PATCH ================== */

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const userId = String(body.user_id ?? "").trim();
  if (!userId) return NextResponse.json({ error: "user_id_required" }, { status: 400 });

  const svc = getServiceSupabase();

  // смена логина
  if (body.login !== undefined) {
    const login = String(body.login).trim();
    if (!login) return NextResponse.json({ error: "login_empty" }, { status: 400 });

    const { error: e1 } = await svc.from("login_accounts").update({ login }).eq("user_id", userId);
    if (e1) return NextResponse.json({ error: e1.message }, { status: 400 });

    const { error: e2 } = await svc.from("profiles").update({ username: login }).eq("id", userId);
    if (e2) return NextResponse.json({ error: e2.message }, { status: 400 });
  }

  // смена роли
  if (body.role !== undefined) {
    const role = body.role === "admin" ? "admin" : "user";
    const { error } = await svc.from("profiles").update({ role }).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // сброс пароля
  if (body.reset_password === true) {
    const tempPassword = genTempPassword();

    const upd = await svc.auth.admin.updateUserById(userId, { password: tempPassword });
    if (upd.error) return NextResponse.json({ error: upd.error.message }, { status: 400 });

    const { error } = await svc
      .from("login_accounts")
      .update({ must_change_password: true, temp_password: tempPassword })
      .eq("user_id", userId);

    if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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
  if (!userId) return NextResponse.json({ error: "user_id_required" }, { status: 400 });

  const svc = getServiceSupabase();

  try {
    await svc.from("login_accounts").delete().eq("user_id", userId);
  } catch {}

  try {
    await svc.from("profiles").delete().eq("id", userId);
  } catch {}

  const del = await svc.auth.admin.deleteUser(userId);
  if (del.error) return NextResponse.json({ error: del.error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
