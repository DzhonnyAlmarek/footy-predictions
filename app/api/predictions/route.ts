import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/* ===== utils ===== */

function mustEnv(name: string): string {
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

function service() {
  return createClient(
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

/* ===== GET: прогнозы текущего пользователя ===== */

export async function GET() {
  try {
    const { rawLogin, fpLogin } = await readLogin();
    if (!fpLogin) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "cookies", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    const sb = service();

    const { data: acc, error: accErr } = await sb
      .from("login_accounts")
      .select("user_id")
      .eq("login", fpLogin)
      .maybeSingle();

    if (accErr) return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    if (!acc?.user_id) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "login_accounts", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    const { data, error } = await sb.from("predictions").select("*").eq("user_id", acc.user_id);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

/* ===== POST: upsert/ delete ===== */

export async function POST(req: Request) {
  try {
    const { rawLogin, fpLogin } = await readLogin();
    if (!fpLogin) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "cookies", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    const payload = await req.json().catch(() => null);
    const match_id = Number(payload?.match_id);

    const home_raw = payload?.home_pred;
    const away_raw = payload?.away_pred;

    // null если пусто/не передали
    const home_pred: number | null =
      home_raw === null || home_raw === undefined || home_raw === "" ? null : Number(home_raw);
    const away_pred: number | null =
      away_raw === null || away_raw === undefined || away_raw === "" ? null : Number(away_raw);

    if (!Number.isFinite(match_id) || match_id <= 0) {
      return NextResponse.json({ ok: false, error: "bad_match_id" }, { status: 400 });
    }

    const sb = service();

    const { data: acc, error: accErr } = await sb
      .from("login_accounts")
      .select("user_id")
      .eq("login", fpLogin)
      .maybeSingle();

    if (accErr) return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    if (!acc?.user_id) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "login_accounts", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    // ✅ удалить прогноз (оба пустые)
    if (home_pred === null && away_pred === null) {
      const { error } = await sb
        .from("predictions")
        .delete()
        .eq("user_id", acc.user_id)
        .eq("match_id", match_id);

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    }

    // ✅ сохраняем только если оба числа валидные
    if (
      home_pred === null ||
      away_pred === null ||
      !Number.isInteger(home_pred) ||
      !Number.isInteger(away_pred) ||
      home_pred < 0 ||
      away_pred < 0
    ) {
      return NextResponse.json({ ok: false, error: "bad_pred_values" }, { status: 400 });
    }

    const row = {
      user_id: acc.user_id,
      match_id,
      home_pred,
      away_pred,
    };

    const { error } = await sb.from("predictions").upsert(row, { onConflict: "match_id,user_id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });

    return NextResponse.json({ ok: true, saved: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
