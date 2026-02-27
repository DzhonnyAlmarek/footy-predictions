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
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

/** Админ-проверка: cookie fp_login -> login_accounts -> profiles.role=admin */
async function requireAdmin(): Promise<
  { ok: true; user_id: string; login: string } | { ok: false; res: NextResponse }
> {
  const cs = await cookies();
  const raw = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(raw).trim().toUpperCase();

  if (!login) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 }),
    };
  }

  const sb = service();

  const { data: acc, error: accErr } = await sb
    .from("login_accounts")
    .select("user_id")
    .eq("login", login)
    .maybeSingle();

  if (accErr) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "accounts_failed", detail: accErr.message }, { status: 500 }),
    };
  }

  if (!acc?.user_id) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 }),
    };
  }

  const { data: prof, error: profErr } = await sb
    .from("profiles")
    .select("role")
    .eq("id", acc.user_id)
    .maybeSingle();

  if (profErr) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "profiles_failed", detail: profErr.message }, { status: 500 }),
    };
  }

  if (prof?.role !== "admin") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }

  return { ok: true, user_id: acc.user_id, login };
}

/** GET /api/admin/matches?stage_id=123 */
export async function GET(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const url = new URL(req.url);
  const stageIdRaw = url.searchParams.get("stage_id");

  const sb = service();

  let q = sb.from("matches").select(
    `
      id,
      stage_id,
      tour_id,
      stage_match_no,
      kickoff_at,
      deadline_at,
      status,
      home_score,
      away_score,
      home_team_id,
      away_team_id,
      home_team:teams!matches_home_team_id_fkey ( name, slug ),
      away_team:teams!matches_away_team_id_fkey ( name, slug )
    `
  );

  if (stageIdRaw) q = q.eq("stage_id", Number(stageIdRaw));

  const { data, error } = await q
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: "matches_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matches: data ?? [] });
}

type PatchBody = {
  id?: number;
  match_id?: number;

  home_score?: number | null;
  away_score?: number | null;
  status?: string | null;

  kickoff_at?: string | null;
  deadline_at?: string | null;

  home_team_id?: number;
  away_team_id?: number;
};

/**
 * PATCH /api/admin/matches
 * При изменении счёта: вызываем score_match_core(match_id) (без auth.uid()-проверки).
 */
export async function PATCH(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  const id = Number(body?.id ?? body?.match_id);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();

  const upd: Record<string, any> = {};

  // частичный апдейт — только то, что реально прислали
  if (body && "home_score" in body) upd.home_score = body.home_score ?? null;
  if (body && "away_score" in body) upd.away_score = body.away_score ?? null;
  if (body && "status" in body) upd.status = body.status ?? null;

  if (body && "kickoff_at" in body) upd.kickoff_at = body.kickoff_at ?? null;
  if (body && "deadline_at" in body) upd.deadline_at = body.deadline_at ?? null;

  if (body && "home_team_id" in body) upd.home_team_id = body.home_team_id;
  if (body && "away_team_id" in body) upd.away_team_id = body.away_team_id;

  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  const { data: match, error } = await sb
    .from("matches")
    .update(upd)
    .eq("id", id)
    .select("id,stage_id,home_score,away_score,status,kickoff_at,deadline_at,home_team_id,away_team_id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: "update_failed", detail: error.message }, { status: 500 });
  }
  if (!match?.id) {
    return NextResponse.json({ ok: false, error: "not_updated" }, { status: 400 });
  }

  // пересчёт очков — только если трогали счёт (даже если ставим null)
  const scoresTouched = !!body && (("home_score" in body) || ("away_score" in body));

  if (scoresTouched) {
    // если результат очищен — логичнее удалить очки, но это зависит от твоей логики в БД.
    // Здесь делаем так:
    // - если оба счёта НЕ null -> считаем очки
    // - иначе -> пропускаем (или можешь вызвать отдельную функцию очистки)
    const hs = match.home_score;
    const as = match.away_score;

    if (hs != null && as != null) {
      // ✅ ВАЖНО: вызываем core без admin-check
      const { error: rpcErr } = await sb.rpc("score_match_core", { p_match_id: Number(match.id) });
      if (rpcErr) {
        return NextResponse.json(
          { ok: false, error: "score_failed", detail: rpcErr.message },
          { status: 500 }
        );
      }
    }

    // аналитика этапа — если функция есть
    try {
      const stageId = Number((match as any).stage_id);
      if (Number.isFinite(stageId) && stageId > 0) {
        const { error: aErr } = await sb.rpc("recalculate_stage_analytics", { p_stage_id: stageId });
        // если функции нет — не валим апдейт матча
        if (aErr && !String(aErr.message).toLowerCase().includes("function")) {
          throw aErr;
        }
      }
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: "analytics_recompute_failed", detail: String(e?.message ?? e) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, match });
}

export async function POST(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();

  const { data, error } = await sb.from("matches").insert(payload).select("*").maybeSingle();
  if (error) {
    return NextResponse.json({ ok: false, error: "insert_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}

export async function DELETE(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const body = (await req.json().catch(() => null)) as { id?: number; match_id?: number } | null;
  const id = Number(body?.id ?? body?.match_id);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();

  const { error } = await sb.from("matches").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: "delete_failed", detail: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}