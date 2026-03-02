import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { createClient } from "@supabase/supabase-js";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function fileSafeName(s) {
  return String(s)
    .trim()
    .replace(/[^\p{L}\p{N}\-_ .]/gu, "_")
    .replace(/\s+/g, " ")
    .slice(0, 140);
}

const sb = createClient(
  mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
  mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false } }
);

async function main() {
  const now = new Date().toISOString();

  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("*")
    .eq("is_current", true)
    .maybeSingle();

  if (sErr) throw new Error(`stage_load_failed: ${sErr.message}`);
  if (!stage?.id) throw new Error("No current stage (stages.is_current=true)");

  const stageId = Number(stage.id);

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

  const matchIds = (matches ?? []).map((m) => Number(m.id)).filter((x) => Number.isFinite(x));

  const { data: predictions, error: pErr } = await sb
    .from("predictions")
    .select("*")
    .in("match_id", matchIds.length ? matchIds : [-1])
    .order("match_id", { ascending: true });

  if (pErr) throw new Error(`predictions_load_failed: ${pErr.message}`);

  const { data: ledger, error: lErr } = await sb
    .from("points_ledger")
    .select("*")
    .in("match_id", matchIds.length ? matchIds : [-1])
    .order("match_id", { ascending: true });

  if (lErr) throw new Error(`ledger_load_failed: ${lErr.message}`);

  const teamIds = new Set();
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

  const payload = {
    meta: {
      exported_at: now,
      stage_id: stageId,
      stage_name: stage?.name ?? null,
      include_ledger: true,
      matches_count: matches?.length ?? 0,
      predictions_count: predictions?.length ?? 0,
      ledger_rows_count: ledger?.length ?? 0,
      version: 1,
    },
    stage,
    tours: tours ?? [],
    matches: matches ?? [],
    predictions: predictions ?? [],
    points_ledger: ledger ?? [],
    teams: teams ?? [],
  };

  const outDir = path.join(process.cwd(), "_backups");
  fs.mkdirSync(outDir, { recursive: true });

  const base = fileSafeName(`stage-${stageId}-${stage?.name ?? "backup"}-${now}`);
  const jsonPath = path.join(outDir, `${base}.json`);
  const gzPath = path.join(outDir, `${base}.json.gz`);

  const json = JSON.stringify(payload, null, 2);
  fs.writeFileSync(jsonPath, json, "utf8");

  const gz = zlib.gzipSync(Buffer.from(json, "utf8"), { level: 9 });
  fs.writeFileSync(gzPath, gz);

  console.log(`OK: wrote ${jsonPath}`);
  console.log(`OK: wrote ${gzPath} (${Math.round(gz.length / 1024)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});