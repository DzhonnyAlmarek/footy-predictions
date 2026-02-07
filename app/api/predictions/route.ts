import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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
    { auth: { persistSession: false } }
  );
}

async function readLogin() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  return { rawLogin, fpLogin };
}

// GET — прогнозы текущего пользователя
export async function GET() {
  try {
    const { fpLogin } = await readLogin();
    if (!fpLogin) {
      return NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 });
    }

    const sb = service();

    const { data: acc, error: accErr } = await sb
      .from("login_accounts")
      .select("user_id")
      .eq("login", fpLogin)
      .maybeSingle();

    if (accErr) return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    if (!acc?.user_id) return NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 });

    const { data, error } = await sb
      .from("predictions")
      .select("*")
      .eq("user_id", acc.user_id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}

// POST — upsert или delete прогноза
export async function POST(req: Request) {
  try {
    const { fpLogin } = await readLogin();
    if (!fpLogin) return NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 });

    const payload = await req.json().catch(() => null);
    if (!payload) return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });

    const match_id = Number(payload?.match_id);
    if (!Number.isFinite(match_id)) {
      return NextResponse.json({ ok: false, error: "bad_match_id" }, { status: 400 });
    }

    const rawHome = payload?.home_pred;
    const rawAway = payload?.away_pred;

    const sb = service();

    const { data: acc, error: accErr } = await sb
      .from("login_accounts")
      .select("user_id")
      .eq("login", fpLogin)
      .maybeSingle();

    if (accErr) return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    if (!acc?.user_id) return NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 });

    // ✅ DELETE: если пришло null/null — удаляем строку прогноза
    if (rawHome === null && rawAway === null) {
      const { error } = await sb
        .from("predictions")
        .delete()
        .eq("user_id", acc.user_id)
        .eq("match_id", match_id);

      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
      return NextResponse.json({ ok: true, deleted: true });
    }

    // ✅ UPSERT: иначе оба должны быть целыми 0+
    const home_pred = Number(rawHome);
    const away_pred = Number(rawAway);

    if (
      !Number.isInteger(home_pred) ||
      !Number.isInteger(away_pred) ||
      home_pred < 0 ||
      away_pred < 0
    ) {
      return NextResponse.json({ ok: false, error: "bad_pred_values" }, { status: 400 });
    }

    const { error } = await sb
      .from("predictions")
      .upsert(
        { user_id: acc.user_id, match_id, home_pred, away_pred },
        { onConflict: "match_id,user_id" }
      );

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown error" }, { status: 500 });
  }
}
