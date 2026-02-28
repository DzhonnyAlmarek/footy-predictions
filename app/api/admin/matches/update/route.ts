import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

async function tryRpc(sb: ReturnType<typeof service>, fn: string, args: any) {
  const { error } = await sb.rpc(fn, args);
  return error ? { ok: false as const, message: error.message } : { ok: true as const };
}

export async function POST(req: Request) {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();

  if (login !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "bad_json" }, { status: 400 });
  }

  const matchId = Number(body.matchId);
  if (!matchId) {
    return NextResponse.json({ ok: false, error: "bad_matchId" }, { status: 400 });
  }

  const patch: any = {};
  if ("home_score" in body) patch.home_score = body.home_score;
  if ("away_score" in body) patch.away_score = body.away_score;
  if ("kickoff_at" in body) patch.kickoff_at = body.kickoff_at;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: false, error: "empty_patch" }, { status: 400 });
  }

  // Если оба счёта заданы (и не null/undefined) — считаем матч завершённым
  const hasHome = "home_score" in patch && patch.home_score != null;
  const hasAway = "away_score" in patch && patch.away_score != null;
  if (hasHome && hasAway) {
    patch.status = "finished";
  }

  try {
    const sb = service();

    const { error: updErr } = await sb.from("matches").update(patch).eq("id", matchId);

    if (updErr) {
      return NextResponse.json(
        { ok: false, error: "db_update_failed", message: updErr.message },
        { status: 500 }
      );
    }

    // Пересчитываем начисления. Пробуем несколько вариантов имён/аргументов,
    // чтобы не гадать как именно названы параметры в SQL-функциях.
    const attempts: Array<{ fn: string; args: any }> = [
      { fn: "recalculate_match", args: { p_match_id: matchId } },
      { fn: "recalculate_match", args: { match_id: matchId } },
      { fn: "recalculate_match", args: { id: matchId } },

      { fn: "score_match", args: { p_match_id: matchId } },
      { fn: "score_match", args: { match_id: matchId } },
      { fn: "score_match", args: { id: matchId } },
    ];

    let lastMsg = "";
    let ok = false;

    for (const a of attempts) {
      const r = await tryRpc(sb, a.fn, a.args);
      if (r.ok) {
        ok = true;
        break;
      }
      lastMsg = `${a.fn}(${Object.keys(a.args).join(",")}): ${r.message}`;
    }

    if (!ok) {
      return NextResponse.json(
        {
          ok: false,
          error: "recalc_failed",
          message:
            lastMsg ||
            "Could not run recalculate_match/score_match (check function name/args and permissions).",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "update_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}