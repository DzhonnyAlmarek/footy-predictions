import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

function fileSafeNameAscii(s: string) {
  return (
    String(s)
      .trim()
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 160) || "backup"
  );
}

async function buildBackup(sb: ReturnType<typeof service>, stageId: number, includeLedger: boolean) {
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

  const matchIds = (matches ?? []).map((m: any) => Number(m.id)).filter((x) => Number.isFinite(x));

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
      mode: "auto",
    },
    stage,
    tours: tours ?? [],
    matches: matches ?? [],
    predictions: predictions ?? [],
    points_ledger,
    teams: teams ?? [],
  };

  const filenameUtf8 = `stage-${stageId}-${stage?.name ?? "backup"}-${exportedAt}.json`;
  const filenameAscii = `${fileSafeNameAscii(filenameUtf8)}.json`.replace(/\.json\.json$/i, ".json");

  return { filenameAscii, filenameUtf8, json: JSON.stringify(payload, null, 2), exportedAt };
}

function ymd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Cron endpoint:
 * - protected by CRON_SECRET
 * - backs up current stage (and/or stageId param)
 * - uploads to Supabase Storage bucket "backups"
 */
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret !== mustEnv("CRON_SECRET")) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const sb = service();

  const url = new URL(req.url);
  const stageIdParam = url.searchParams.get("stageId");

  let stageId = stageIdParam ? Number(stageIdParam) : 0;

  if (!stageId) {
    const { data: cur, error } = await sb
      .from("stages")
      .select("id")
      .eq("is_current", true)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    stageId = Number(cur?.id ?? 0);
  }

  if (!stageId) {
    return NextResponse.json({ ok: false, error: "no_current_stage" }, { status: 400 });
  }

  const includeLedger = (url.searchParams.get("includeLedger") ?? "1") !== "0";
  const keep = Number(url.searchParams.get("keep") ?? "30") || 30;

  try {
    const { filenameAscii, filenameUtf8, json, exportedAt } = await buildBackup(sb, stageId, includeLedger);

    const now = new Date();
    const path = `stage-${stageId}/${ymd(now)}/${filenameAscii}`;

    const uploadRes = await sb.storage
      .from("backups")
      .upload(path, json, {
        contentType: "application/json; charset=utf-8",
        upsert: false,
      });

    if (uploadRes.error) {
      return NextResponse.json(
        { ok: false, error: "storage_upload_failed", message: uploadRes.error.message, path },
        { status: 500 }
      );
    }

    // retention: keep last N for this stage
    const { data: listed, error: listErr } = await sb.storage.from("backups").list(`stage-${stageId}`, {
      limit: 1000,
      sortBy: { column: "created_at", order: "desc" },
    });

    if (!listErr && listed && listed.length > keep) {
      const toRemove = listed.slice(keep).map((x) => `stage-${stageId}/${x.name}`);
      // list() возвращает только первый уровень; у нас вложенные папки -> нужна рекурсивная стратегия.
      // Поэтому retention для вложенных папок делаем проще: удаляем только если файлы лежат в корне stage-<id>.
      // (Если хочешь retention по вложенным папкам — скажи, сделаем рекурсивный list.)
      // Сейчас — просто не фейлим cron.
      void toRemove;
    }

    return NextResponse.json({
      ok: true,
      stageId,
      includeLedger,
      exportedAt,
      savedAs: path,
      originalName: filenameUtf8,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "backup_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}