import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient as createAdminClient } from "@supabase/supabase-js";

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

  const sb = getServiceSupabase();

  const { data: acc, error: accErr } = await sb
    .from("login_accounts")
    .select("user_id")
    .eq("login", fpLogin)
    .maybeSingle();

  if (accErr) {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: accErr.message }, { status: 500 }),
    };
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

  const { data: profile, error: profErr } = await sb
    .from("profiles")
    .select("role")
    .eq("id", acc.user_id)
    .maybeSingle();

  if (profErr) {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: profErr.message }, { status: 500 }),
    };
  }

  if (profile?.role !== "admin") {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }

  return { ok: true as const, user_id: acc.user_id };
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (!gate.ok) return gate.res;

  const body = await req.json().catch(() => ({}));
  const stageId = Number(body.stage_id);
  const tourNo = Number(body.tour_no);
  const name = body.name === undefined ? null : String(body.name ?? "").trim() || null;

  if (!Number.isFinite(stageId)) {
    return NextResponse.json({ ok: false, error: "stage_id_required" }, { status: 400 });
  }
  if (!Number.isFinite(tourNo)) {
    return NextResponse.json({ ok: false, error: "tour_no_required" }, { status: 400 });
  }

  const svc = getServiceSupabase();

  // ⚠️ Важно: у вас колонка называется tour_no (как было)
  const { data, error } = await svc
    .from("tours")
    .insert({ stage_id: stageId, tour_no: tourNo, name })
    .select("id")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, id: data.id });
}