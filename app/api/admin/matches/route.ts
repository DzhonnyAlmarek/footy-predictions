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

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const cs = await cookies();
  const raw = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(raw).trim().toUpperCase();

  if (fpLogin !== "ADMIN") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 }),
    };
  }
  return { ok: true };
}

/* ================= scoring helpers ================= */

function signOutcome(h: number, a: number): -1 | 0 | 1 {
  if (h === a) return 0;
  return h > a ? 1 : -1;
}

function multByCount(cnt: number): number {
  if (cnt === 1) return 1.75;
  if (cnt === 2) return 1.5;
  if (cnt === 3) return 1.25;
  return 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function computeBreakdown(params: {
  predH: number;
  predA: number;
  resH: number;
  resA: number;
  outcomeGuessed: number;
  diffGuessed: number;
}): {
  total: number;
  team_goals: number;
  outcome: number;
  diff: number;
  near_bonus: number;
  outcome_mult: number;
  diff_mult: number;
  pred_text: string;
  res_text: string;
} {
  const { predH, predA, resH, resA, outcomeGuessed, diffGuessed } = params;

  const outcome_mult = multByCount(outcomeGuessed);
  const diff_mult = multByCount(diffGuessed);

  let team_goals = 0;
  let outcome = 0;
  let diff = 0;
  let near_bonus = 0;

  if (predH === resH) team_goals += 0.5;
  if (predA === resA) team_goals += 0.5;

  const outOk = signOutcome(predH, predA) === signOutcome(resH, resA);
  if (outOk) outcome = round2(2 * outcome_mult);

  const diffOk = predH - predA === resH - resA;
  if (diffOk) diff = round2(1 * diff_mult);

  const dist = Math.abs(predH - resH) + Math.abs(predA - resA);
  if (dist === 1) near_bonus = 0.5;

  const total = round2(team_goals + outcome + diff + near_bonus);

  return {
    total,
    team_goals,
    outcome,
    diff,
    near_bonus,
    outcome_mult,
    diff_mult,
    pred_text: `${predH}:${predA}`,
    res_text: `${resH}:${resA}`,
  };
}

async function recomputePredictionScores(sb: ReturnType<typeof service>, matchId: number) {
  const { data: match, error: mErr } = await sb
    .from("matches")
    .select("id,home_score,away_score")
    .eq("id", matchId)
    .maybeSingle();

  if (mErr) throw new Error(mErr.message);
  if (!match?.id) throw new Error("match_not_found");

  const resH = match.home_score;
  const resA = match.away_score;

  // если результат очищен — удаляем breakdown
  if (resH == null || resA == null) {
    const { error: delErr } = await sb.from("prediction_scores").delete().eq("match_id", matchId);
    if (delErr) throw new Error(delErr.message);
    return;
  }

  const { data: preds, error: pErr } = await sb
    .from("predictions")
    .select("id,match_id,user_id,home_pred,away_pred")
    .eq("match_id", matchId);

  if (pErr) throw new Error(pErr.message);

  const predRows = (preds ?? []).filter((p: any) => p.home_pred != null && p.away_pred != null);

  let outcomeGuessed = 0;
  let diffGuessed = 0;

  for (const p of predRows) {
    const ph = Number(p.home_pred);
    const pa = Number(p.away_pred);

    if (signOutcome(ph, pa) === signOutcome(resH, resA)) outcomeGuessed++;
    if (ph - pa === resH - resA) diffGuessed++;
  }

  const upserts = predRows.map((p: any) => {
    const ph = Number(p.home_pred);
    const pa = Number(p.away_pred);

    const bd = computeBreakdown({
      predH: ph,
      predA: pa,
      resH,
      resA,
      outcomeGuessed,
      diffGuessed,
    });

    return {
      prediction_id: Number(p.id),
      match_id: Number(p.match_id),
      user_id: p.user_id,

      total: bd.total,

      team_goals: bd.team_goals,
      outcome: bd.outcome,
      diff: bd.diff,
      near_bonus: bd.near_bonus,

      outcome_guessed: outcomeGuessed,
      outcome_mult: bd.outcome_mult,
      diff_guessed: diffGuessed,
      diff_mult: bd.diff_mult,

      pred_text: bd.pred_text,
      res_text: bd.res_text,

      rule_version: "v1",
      computed_at: new Date().toISOString(),
    };
  });

  if (upserts.length > 0) {
    const { error: uErr } = await sb
      .from("prediction_scores")
      .upsert(upserts, { onConflict: "prediction_id" });

    if (uErr) throw new Error(uErr.message);
  } else {
    const { error: delErr } = await sb.from("prediction_scores").delete().eq("match_id", matchId);
    if (delErr) throw new Error(delErr.message);
  }
}

/** GET /api/admin/matches?stage_id=123 */
export async function GET(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const url = new URL(req.url);
  const stageIdRaw = url.searchParams.get("stage_id");

  const sb = service();

  let q = sb.from("matches").select(`
      id,
      stage_id,
      stage_match_no,
      kickoff_at,
      deadline_at,
      status,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `);

  if (stageIdRaw) q = q.eq("stage_id", Number(stageIdRaw));

  const { data, error } = await q
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matches: data ?? [] });
}

/**
 * PATCH поддерживает частичное обновление:
 * - можно менять только дату (kickoff_at/deadline_at)
 * - или только счёт
 * - или всё вместе
 */
type PatchBody = {
  id: number;

  home_score?: number | null;
  away_score?: number | null;
  status?: string | null;

  kickoff_at?: string | null;
  deadline_at?: string | null;
};

/** PATCH /api/admin/matches */
export async function PATCH(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const body = (await req.json().catch(() => null)) as PatchBody | null;

  // важно: теперь home_score/away_score не обязательны
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();

  const upd: any = {};

  // обновляем только те поля, которые реально пришли
  if ("home_score" in body) upd.home_score = body.home_score ?? null;
  if ("away_score" in body) upd.away_score = body.away_score ?? null;
  if ("status" in body) upd.status = body.status ?? null;

  if ("kickoff_at" in body) upd.kickoff_at = body.kickoff_at;
  if ("deadline_at" in body) upd.deadline_at = body.deadline_at;

  // если вообще ничего не передали кроме id — смысла апдейтить нет
  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("matches")
    .update(upd)
    .eq("id", body.id)
    .select("id,stage_id,home_score,away_score,status,kickoff_at,deadline_at")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ ok: false, error: "not_updated" }, { status: 400 });
  }

  // ✅ пересчёты делаем ТОЛЬКО если менялся счёт
  const scoresTouched = ("home_score" in body) || ("away_score" in body);

  if (scoresTouched) {
    try {
      await recomputePredictionScores(sb, Number(body.id));
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: "score_recompute_failed", detail: String(e?.message ?? e) },
        { status: 500 }
      );
    }

    // ✅ пересчёт аналитики по этапу — тоже только при изменении результата
    try {
      const stageId = Number((data as any).stage_id);
      const { error: aErr } = await sb.rpc("recalculate_stage_analytics", { p_stage_id: stageId });
      if (aErr) throw new Error(aErr.message);
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: "analytics_recompute_failed", detail: String(e?.message ?? e) },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, match: data });
}

/** POST /api/admin/matches — создание матча */
export async function POST(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();

  const { data, error } = await sb.from("matches").insert(payload).select("*");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}