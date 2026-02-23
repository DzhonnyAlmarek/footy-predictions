import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

async function requireAdmin(): Promise<{ ok: true; user_id: string } | { ok: false; res: NextResponse }> {
  const { rawLogin, fpLogin } = await readLogin();

  if (!fpLogin) {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "not_auth", where: "cookies", rawLogin, fpLogin }, { status: 401 }),
    };
  }

  const sb = service();

  const { data: acc, error: accErr } = await sb
    .from("login_accounts")
    .select("user_id")
    .eq("login", fpLogin)
    .maybeSingle();

  if (accErr) {
    return { ok: false, res: NextResponse.json({ ok: false, error: accErr.message }, { status: 500 }) };
  }

  if (!acc?.user_id) {
    return {
      ok: false,
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
    return { ok: false, res: NextResponse.json({ ok: false, error: profErr.message }, { status: 500 }) };
  }

  if (profile?.role !== "admin") {
    return { ok: false, res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }) };
  }

  return { ok: true, user_id: acc.user_id };
}

/* ================= scoring helpers (без изменений) ================= */

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
      res_text: `${resH}:${resA}`,

      rule_version: "v1",
      computed_at: new Date().toISOString(),
    };
  });

  if (upserts.length > 0) {
    const { error: uErr } = await sb.from("prediction_scores").upsert(upserts, { onConflict: "prediction_id" });
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
      home_team_id,
      away_team_id,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `);

  if (stageIdRaw) q = q.eq("stage_id", Number(stageIdRaw));

  const { data, error } = await q
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

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

export async function PATCH(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  const id = Number(body?.id ?? body?.match_id);

  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();
  const upd: any = {};

  if ("home_score" in (body ?? {})) upd.home_score = body?.home_score ?? null;
  if ("away_score" in (body ?? {})) upd.away_score = body?.away_score ?? null;
  if ("status" in (body ?? {})) upd.status = body?.status ?? null;

  if ("kickoff_at" in (body ?? {})) upd.kickoff_at = body?.kickoff_at ?? null;
  if ("deadline_at" in (body ?? {})) upd.deadline_at = body?.deadline_at ?? null;

  if ("home_team_id" in (body ?? {})) upd.home_team_id = body?.home_team_id;
  if ("away_team_id" in (body ?? {})) upd.away_team_id = body?.away_team_id;

  if (Object.keys(upd).length === 0) {
    return NextResponse.json({ ok: false, error: "nothing_to_update" }, { status: 400 });
  }

  const { data, error } = await sb
    .from("matches")
    .update(upd)
    .eq("id", id)
    .select("id,stage_id,home_score,away_score,status,kickoff_at,deadline_at,home_team_id,away_team_id")
    .maybeSingle();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data?.id) return NextResponse.json({ ok: false, error: "not_updated" }, { status: 400 });

  const scoresTouched = ("home_score" in (body ?? {})) || ("away_score" in (body ?? {}));

  if (scoresTouched) {
    try {
      await recomputePredictionScores(sb, id);
    } catch (e: any) {
      return NextResponse.json(
        { ok: false, error: "score_recompute_failed", detail: String(e?.message ?? e) },
        { status: 500 }
      );
    }

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
  if (!payload) return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });

  const sb = service();

  const { data, error } = await sb.from("matches").insert(payload).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, data });
}