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

async function requireUserId(fpLogin: string, rawLogin: string) {
  const sb = service();

  const { data: acc, error: accErr } = await sb
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

  return { ok: true as const, sb, userId: acc.user_id };
}

// GET — прогнозы текущего пользователя
export async function GET() {
  try {
    const { rawLogin, fpLogin } = await readLogin();

    if (!fpLogin) {
      return NextResponse.json(
        { ok: false, error: "not_auth", where: "cookies", rawLogin, fpLogin },
        { status: 401 }
      );
    }

    const u = await requireUserId(fpLogin, rawLogin);
    if (!u.ok) return u.res;

    const { data, error } = await u.sb
      .from("predictions")
      .select("*")
      .eq("user_id", u.userId);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, data });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "unknown error" },
      { status: 500 }
    );
  }
}

// POST — upsert/clear прогноза (match_id + user_id уникальны)
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

    // ✅ home_pred/away_pred теперь могут быть number | null
    const home_raw = payload?.home_pred;
    const away_raw = payload?.away_pred;

    const home_pred: number | null =
      home_raw === null || home_raw === "" || home_raw === undefined ? null : Number(home_raw);

    const away_pred: number | null =
      away_raw === null || away_raw === "" || away_raw === undefined ? null : Number(away_raw);

    if (!Number.isFinite(match_id) || match_id <= 0) {
      return NextResponse.json({ ok: false, error: "bad_payload_match_id" }, { status: 400 });
    }

    const u = await requireUserId(fpLogin, rawLogin);
    if (!u.ok) return u.res;

    // ✅ 1) ОЧИСТКА: оба null → удаляем строку прогноза
    if (home_pred === null && away_pred === null) {
      const { error } = await u.sb
        .from("predictions")
        .delete()
        .eq("user_id", u.userId)
        .eq("match_id", match_id);

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, cleared: true });
    }

    // ✅ 2) Сохранение: оба должны быть числами
    if (!Number.isFinite(home_pred) || !Number.isFinite(away_pred)) {
      return NextResponse.json({ ok: false, error: "bad_payload_pred" }, { status: 400 });
    }
    if (!Number.isInteger(home_pred) || home_pred < 0 || !Number.isInteger(away_pred) || away_pred < 0) {
      return NextResponse.json({ ok: false, error: "bad_pred_values" }, { status: 400 });
    }

    const row = {
      user_id: u.userId,
      match_id,
      home_pred,
      away_pred,
    };

    const { error } = await u.sb
      .from("predictions")
      .upsert(row, { onConflict: "match_id,user_id" });

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
