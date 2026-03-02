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

type Body = {
  stageId?: number;
  includeLedger?: boolean;
};

function fileSafeName(s: string) {
  return String(s)
    .trim()
    .replace(/[^\p{L}\p{N}\-_ .]/gu, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export async function POST(req: Request) {
  // admin by cookie (как у тебя везде)
  const cs = await cookies();
  const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (login !== "ADMIN") {
    return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const stageId = Number(body?.stageId);
  const includeLedger = Boolean(body?.includeLedger ?? true);

  if (!stageId) {
    return NextResponse.json({ ok: false, error: "bad_stageId" }, { status: 400 });
  }

  const sb = service();

  // 1) stage
  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("*")
    .eq("id", stageId)
    .maybeSingle();

  if (sErr) {
    return NextResponse.json({ ok: false, error: "stage_load_failed", message: sErr.message }, { status: 500 });
  }
  if (!stage) {
    return NextResponse.json({ ok: false, error: "stage_not_found" }, { status: 404 });
  }

  // 2) tours
  const { data: tours, error: tErr } = await sb
    .from("tours")
    .select("*")
    .eq("stage_id", stageId)
    .order("tour_no", { ascending: true });

  if (tErr) {
    return NextResponse.json({ ok: false, error: "tours_load_failed", message: tErr.message }, { status: 500 });
  }

  // 3) matches
  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select("*")
    .eq("stage_id", stageId)
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (mErr) {
    return NextResponse.json({ ok: false, error: "matches_load_failed", message: mErr.message }, { status: 500 });
  }

  const matchIds = (matches ?? []).map((m: any) => Number(m.id)).filter((x) => Number.isFinite(x));

  // 4) predictions
  const { data: predictions, error: pErr } = await sb
    .from("predictions")
    .select("*")
    .in("match_id", matchIds.length ? matchIds : [-1])
    .order("match_id", { ascending: true });

  if (pErr) {
    return NextResponse.json({ ok: false, error: "predictions_load_failed", message: pErr.message }, { status: 500 });
  }

  // 5) ledger (optional)
  let points_ledger: any[] | null = null;
  if (includeLedger) {
    const { data: ledger, error: lErr } = await sb
      .from("points_ledger")
      .select("*")
      .in("match_id", matchIds.length ? matchIds : [-1])
      .order("match_id", { ascending: true });

    if (lErr) {
      return NextResponse.json({ ok: false, error: "ledger_load_failed", message: lErr.message }, { status: 500 });
    }
    points_ledger = ledger ?? [];
  }

  // 6) teams for stage (через matches)
  const teamIds = new Set<number>();
  for (const m of matches ?? []) {
    if (m?.home_team_id != null) teamIds.add(Number(m.home_team_id));
    if (m?.away_team_id != null) teamIds.add(Number(m.away_team_id));
  }
  const teamIdList = Array.from(teamIds).filter((x) => Number.isFinite(x));

  const { data: teams, error: teamErr } = await sb
    .from("teams")
    .select("*")
    .in("id", teamIdList.length ? teamIdList : [-1])
    .order("name", { ascending: true });

  if (teamErr) {
    return NextResponse.json({ ok: false, error: "teams_load_failed", message: teamErr.message }, { status: 500 });
  }

  const now = new Date().toISOString();

  const payload = {
    meta: {
      exported_at: now,
      stage_id: Number(stage.id),
      stage_name: stage?.name ?? null,
      include_ledger: includeLedger,
      matches_count: matches?.length ?? 0,
      predictions_count: predictions?.length ?? 0,
      ledger_rows_count: points_ledger?.length ?? 0,
      version: 1,
    },

    stage,
    tours: tours ?? [],
    matches: matches ?? [],
    predictions: predictions ?? [],
    points_ledger: includeLedger ? points_ledger ?? [] : [],
    teams: teams ?? [],
  };

  const json = JSON.stringify(payload, null, 2);

  const fname = fileSafeName(`stage-${stageId}-${stage?.name ?? "backup"}-${now}.json`);

  return new Response(json, {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${fname}"`,
      "cache-control": "no-store",
    },
  });
}