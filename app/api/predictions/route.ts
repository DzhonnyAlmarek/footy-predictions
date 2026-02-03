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

// GET — получить прогнозы пользователя
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

    if (accErr) {
      return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    }
    if (!acc?.user_id) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "login_accounts", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    const { data, error } = await sb
      .from("predictions")
      .select("*")
      .eq("user_id", acc.user_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}

// POST — upsert прогноза
export async function POST(req: Request) {
  try {
    const { rawLogin, fpLogin } = await readLogin();

    if (!fpLogin) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "cookies", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    const payload = await req.json();
    const match_id = Number(payload?.match_id);
    const home_pred = Number(payload?.home_pred);
    const away_pred = Number(payload?.away_pred);

    if (!Number.isFinite(match_id) || !Number.isFinite(home_pred) || !Number.isFinite(away_pred)) {
      return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
    }

    const sb = service();

    const { data: acc, error: accErr } = await sb
      .from("login_accounts")
      .select("user_id")
      .eq("login", fpLogin)
      .maybeSingle();

    if (accErr) {
      return NextResponse.json({ ok: false, error: accErr.message }, { status: 500 });
    }
    if (!acc?.user_id) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "login_accounts", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    const row = {
      user_id: acc.user_id,
      match_id,
      home_pred,
      away_pred,
    };

    const { error } = await sb.from("predictions").upsert(row);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}
