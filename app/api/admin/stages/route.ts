import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  if (accErr) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: accErr.message }, { status: 500 }) };
  }

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

  if (profErr) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: profErr.message }, { status: 500 }) };
  }

  if (profile?.role !== "admin") {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }) };
  }

  return { ok: true as const, user_id: acc.user_id };
}

/* ================== POST: create stage ================== */

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim();
  const matchesRequired = body.matches_required === undefined ? 56 : Number(body.matches_required);

  if (!name) return NextResponse.json({ ok: false, error: "name_required" }, { status: 400 });
  if (!Number.isFinite(matchesRequired) || matchesRequired <= 0) {
    return NextResponse.json({ ok: false, error: "matches_required_invalid" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  const { data, error } = await svc
    .from("stages")
    .insert({
      name,
      status: "draft",
      is_current: false,
      matches_required: matchesRequired,
    })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, id: data.id });
}

/* ================== PATCH: update OR set current ================== */

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const stageId = Number(body.stage_id);

  if (!Number.isFinite(stageId)) {
    return NextResponse.json({ ok: false, error: "stage_id_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // ✅ поставить текущим
  if (body.set_current === true) {
    const { error: e1 } = await svc.from("stages").update({ is_current: false }).neq("id", -1);
    if (e1) return NextResponse.json({ ok: false, error: e1.message }, { status: 400 });

    const { error: e2 } = await svc.from("stages").update({ is_current: true }).eq("id", stageId);
    if (e2) return NextResponse.json({ ok: false, error: e2.message }, { status: 400 });

    return NextResponse.json({ ok: true });
  }

  // ✅ редактирование (в UI: name + matches_required)
  const patch: any = {};

  if (body.name !== undefined) {
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "name_empty" }, { status: 400 });
    patch.name = name;
  }

  if (body.matches_required !== undefined) {
    const mr = Number(body.matches_required);
    if (!Number.isFinite(mr) || mr <= 0) {
      return NextResponse.json({ ok: false, error: "matches_required_invalid" }, { status: 400 });
    }
    patch.matches_required = mr;
  }

  if (body.status !== undefined) {
    const s = String(body.status);
    if (!["draft", "published", "locked"].includes(s)) {
      return NextResponse.json({ ok: false, error: "status_invalid" }, { status: 400 });
    }
    patch.status = s;
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });

  const { error } = await svc.from("stages").update(patch).eq("id", stageId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

/* ================== DELETE: delete stage ================== */

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const stageId = Number(body.stage_id);

  if (!Number.isFinite(stageId)) {
    return NextResponse.json({ ok: false, error: "stage_id_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // безопасное удаление (если cascade не настроен)
  await svc.from("matches").delete().eq("stage_id", stageId);
  await svc.from("tours").delete().eq("stage_id", stageId);

  const { error } = await svc.from("stages").delete().eq("id", stageId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}