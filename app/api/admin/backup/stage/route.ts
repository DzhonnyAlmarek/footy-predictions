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

/**
 * Для заголовка Content-Disposition нужен ASCII filename,
 * иначе Node/undici падают ("character ... > 255").
 */
function fileSafeNameAscii(s: string) {
  return (
    String(s)
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 140) || "backup"
  );
}

/**
 * RFC5987: filename* для UTF-8 (чтобы браузер сохранил красивое имя),
 * и обычный filename (ASCII) для совместимости.
 */
function contentDisposition(filenameAscii: string, filenameUtf8: string) {
  const encoded = encodeURIComponent(filenameUtf8)
    .replace(/['()]/g, escape)
    .replace(/\*/g, "%2A");
  return `attachment; filename="${filenameAscii}"; filename*=UTF-8''${encoded}`;
}

async function assertAdmin() {
  const cs = await cookies();
  const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (login !== "ADMIN") {
    return {
      ok: false as const,
      res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }
  return { ok: true as const };
}

async function buildBackup(stageId: number, includeLedger: boolean) {
  const sb = service();

  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("*")
    .eq("id", stageId)
    .maybeSingle();

  if (sErr) throw new Error(`stage_load_failed: ${sErr.message}`);
  if (!stage) throw new Error(`stage_not_found: ${stageId}`);

  const { data: tours, error: tErr } = await sb
    .from("tours")
    .select("*")
    .eq("stage_id", stageId)
    .order("tour_no", { ascending: true });

  if (tErr) throw new Error(`tours_load_failed: ${tErr.message}`);

  const { data: matches, error: mErr } = await sb
    .from("matches")
    .select("*")
    .eq("stage_id", stageId)
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (mErr) throw new Error(`matches_load_failed: ${mErr.message}`);

  const matchIds = (matches ?? [])
    .map((m: any) => Number(m.id))
    .filter((x) => Number.isFinite(x));

  const { data: predictions, error: pErr } = await sb
    .from("predictions")
    .select("*")
    .in("match_id", matchIds.length ? matchIds : [-1])
    .order("match_id", { ascending: true });

  if (pErr) throw new Error(`predictions_load_failed: ${pErr.message}`);

  let points_ledger: any[] = [];
  if (includeLedger) {
    const { data: ledger, error: lErr } = await sb
      .from("points_ledger")
      .select("*")
      .in("match_id", matchIds.length ? matchIds : [-1])
      .order("match_id", { ascending: true });

    if (lErr) throw new Error(`ledger_load_failed: ${lErr.message}`);
    points_ledger = ledger ?? [];
  }

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

  if (teamErr) throw new Error(`teams_load_failed: ${teamErr.message}`);

  const exportedAt = new Date().toISOString();

  const payload = {
    meta: {
      version: 1,
      exported_at: exportedAt,
      stage_id: stageId,
      stage_name: stage?.name ?? null,
      include_ledger: includeLedger,
      matches_count: matches?.length ?? 0,
      predictions_count: predictions?.length ?? 0,
      ledger_rows_count: points_ledger?.length ?? 0,
    },
    stage,
    tours: tours ?? [],
    matches: matches ?? [],
    predictions: predictions ?? [],
    points_ledger,
    teams: teams ?? [],
  };

  // UTF-8 имя (красивое) + ASCII имя (безопасное для заголовков)
  const filenameUtf8 = `stage-${stageId}-${stage?.name ?? "backup"}-${exportedAt}.json`;
  const baseAscii = fileSafeNameAscii(filenameUtf8);
  const filenameAscii = baseAscii.toLowerCase().endsWith(".json") ? baseAscii : `${baseAscii}.json`;

  const json = JSON.stringify(payload, null, 2);

  return { filenameAscii, filenameUtf8, json };
}

/**
 * ✅ GET: /api/admin/backup/stage?stageId=4&includeLedger=1
 */
export async function GET(req: Request) {
  const a = await assertAdmin();
  if (!a.ok) return a.res;

  const url = new URL(req.url);
  const stageId = Number(url.searchParams.get("stageId") ?? "");
  const includeLedger = (url.searchParams.get("includeLedger") ?? "1") !== "0";

  if (!stageId) {
    return NextResponse.json({ ok: false, error: "bad_stageId" }, { status: 400 });
  }

  try {
    const { filenameAscii, filenameUtf8, json } = await buildBackup(stageId, includeLedger);

    return new NextResponse(json, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": contentDisposition(filenameAscii, filenameUtf8),
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "backup_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

/**
 * ✅ POST: JSON body { stageId, includeLedger }
 */
export async function POST(req: Request) {
  const a = await assertAdmin();
  if (!a.ok) return a.res;

  const body = await req.json().catch(() => null);
  const stageId = Number(body?.stageId ?? "");
  const includeLedger = body?.includeLedger !== false; // default true

  if (!stageId) {
    return NextResponse.json({ ok: false, error: "bad_stageId" }, { status: 400 });
  }

  try {
    const { filenameAscii, filenameUtf8, json } = await buildBackup(stageId, includeLedger);

    return new NextResponse(json, {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": contentDisposition(filenameAscii, filenameUtf8),
        "cache-control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "backup_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}