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

type Mode = "dry_run" | "apply";
type Strategy = "upsert" | "replace";

type ReqBody = {
  mode?: Mode;
  strategy?: Strategy;
  payload?: any; // backup JSON
};

function asInt(n: any): number | null {
  const x = Number(n);
  return Number.isFinite(x) ? x : null;
}

function pickArray(x: any): any[] {
  return Array.isArray(x) ? x : [];
}

export async function POST(req: Request) {
  // admin only (cookie)
  const cs = await cookies();
  const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (login !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as ReqBody | null;
  if (!body?.payload) {
    return NextResponse.json({ ok: false, error: "bad_payload" }, { status: 400 });
  }

  const mode: Mode = body.mode === "apply" ? "apply" : "dry_run";
  const strategy: Strategy = body.strategy === "replace" ? "replace" : "upsert";

  const payload = body.payload;

  const meta = payload?.meta ?? {};
  const stage = payload?.stage ?? null;

  const stageId = asInt(meta?.stage_id ?? stage?.id);
  if (!stageId) {
    return NextResponse.json({ ok: false, error: "no_stage_id_in_backup" }, { status: 400 });
  }

  const tours = pickArray(payload?.tours);
  const matches = pickArray(payload?.matches);
  const predictions = pickArray(payload?.predictions);
  const points_ledger = pickArray(payload?.points_ledger);
  const teams = pickArray(payload?.teams);

  // базовые sanity-checks
  const matchIds = matches.map((m) => asInt(m?.id)).filter(Boolean) as number[];
  const predMatchIds = predictions.map((p) => asInt(p?.match_id)).filter(Boolean) as number[];

  const badPreds = predMatchIds.filter((mid) => !matchIds.includes(mid));
  const warnings: string[] = [];
  if (badPreds.length) warnings.push(`В бэкапе есть прогнозы на неизвестные матчи (match_id): ${badPreds.slice(0, 10).join(", ")}${badPreds.length > 10 ? "…" : ""}`);

  const summary = {
    stage_id: stageId,
    stage_name: meta?.stage_name ?? stage?.name ?? null,
    strategy,
    counts: {
      teams: teams.length,
      tours: tours.length,
      matches: matches.length,
      predictions: predictions.length,
      points_ledger: points_ledger.length,
    },
    warnings,
  };

  if (mode === "dry_run") {
    return NextResponse.json({ ok: true, mode, summary });
  }

  // APPLY
  const sb = service();

  // 1) при replace — чистим данные этапа (бережно и по stage/match_ids)
  if (strategy === "replace") {
    // удаляем сначала зависимые
    if (matchIds.length) {
      const { error: delPredErr } = await sb.from("predictions").delete().in("match_id", matchIds);
      if (delPredErr) {
        return NextResponse.json({ ok: false, error: "delete_predictions_failed", message: delPredErr.message }, { status: 500 });
      }

      const { error: delLedErr } = await sb.from("points_ledger").delete().in("match_id", matchIds);
      if (delLedErr) {
        return NextResponse.json({ ok: false, error: "delete_ledger_failed", message: delLedErr.message }, { status: 500 });
      }

      const { error: delMatchErr } = await sb.from("matches").delete().in("id", matchIds);
      if (delMatchErr) {
        return NextResponse.json({ ok: false, error: "delete_matches_failed", message: delMatchErr.message }, { status: 500 });
      }
    }

    // туры этапа (если есть FK RESTRICT — матчи уже удалены)
    const { error: delTourErr } = await sb.from("tours").delete().eq("stage_id", stageId);
    if (delTourErr) {
      return NextResponse.json({ ok: false, error: "delete_tours_failed", message: delTourErr.message }, { status: 500 });
    }
  }

  // 2) teams (upsert by id)
  if (teams.length) {
    const { error } = await sb.from("teams").upsert(teams, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ ok: false, error: "upsert_teams_failed", message: error.message }, { status: 500 });
    }
  }

  // 3) stage (upsert by id) — аккуратно
  if (stage) {
    const { error } = await sb.from("stages").upsert([stage], { onConflict: "id" });
    if (error) {
      return NextResponse.json({ ok: false, error: "upsert_stage_failed", message: error.message }, { status: 500 });
    }
  }

  // 4) tours
  if (tours.length) {
    const { error } = await sb.from("tours").upsert(tours, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ ok: false, error: "upsert_tours_failed", message: error.message }, { status: 500 });
    }
  }

  // 5) matches
  if (matches.length) {
    const { error } = await sb.from("matches").upsert(matches, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ ok: false, error: "upsert_matches_failed", message: error.message }, { status: 500 });
    }
  }

  // 6) predictions
  if (predictions.length) {
    const { error } = await sb.from("predictions").upsert(predictions, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ ok: false, error: "upsert_predictions_failed", message: error.message }, { status: 500 });
    }
  }

  // 7) points_ledger (optional)
  if (points_ledger.length) {
    const { error } = await sb.from("points_ledger").upsert(points_ledger, { onConflict: "id" });
    if (error) {
      return NextResponse.json({ ok: false, error: "upsert_ledger_failed", message: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true, mode, summary });
}