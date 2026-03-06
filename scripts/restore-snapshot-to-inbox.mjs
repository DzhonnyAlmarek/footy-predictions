import { createClient } from "@supabase/supabase-js";
import zlib from "node:zlib";

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

const SUPABASE_URL = mustEnv("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
const BUCKET = mustEnv("SUPABASE_STORAGE_BUCKET");
const SNAPSHOT_PATH = mustEnv("SNAPSHOT_PATH"); // например: stage/2026-03-05/xxx.json.gz
const STAGE_ID = Number(mustEnv("STAGE_ID"));
const DRY_RUN = (process.env.DRY_RUN ?? "true") === "true";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function downloadSnapshot() {
  const { data, error } = await supabase.storage.from(BUCKET).download(SNAPSHOT_PATH);
  if (error) throw error;

  const ab = await data.arrayBuffer();
  const gz = Buffer.from(ab);
  const jsonBuf = zlib.gunzipSync(gz);
  return JSON.parse(jsonBuf.toString("utf8"));
}

function pickArrays(snapshot) {
  // ожидаем snapshot.meta + snapshot.data (как в моих примерах)
  const data = snapshot.data ?? snapshot;
  return {
    stages: data.stages ?? [],
    tours: data.tours ?? [],
    matches: data.matches ?? [],
    predictions: data.predictions ?? [],
    points_ledger: data.points_ledger ?? data.pointsLedger ?? [],
  };
}

async function main() {
  const snapshot = await downloadSnapshot();

  // 1) создаём run
  const { data: runRow, error: runErr } = await supabase
    .from("restore_tmp.restore_runs")
    .insert({
      stage_id: STAGE_ID,
      snapshot_path: SNAPSHOT_PATH,
      dry_run: DRY_RUN,
      status: "inbox",
      details: { format: snapshot?.meta?.format ?? null, exported_at: snapshot?.meta?.exported_at ?? null },
    })
    .select("id")
    .single();

  if (runErr) throw runErr;
  const runId = runRow.id;

  // 2) кладём данные в inbox
  const arrays = pickArrays(snapshot);

  const rows = [];
  for (const [table, arr] of Object.entries(arrays)) {
    for (const r of arr) {
      rows.push({ run_id: runId, table_name: table, row: r });
    }
  }

  // батчим, чтобы не упереться в лимиты
  const batchSize = 500;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { error } = await supabase.from("restore_tmp.inbox").insert(chunk);
    if (error) throw error;
  }

  // 3) validate (и optionally apply)
  const { data: v, error: ve } = await supabase.rpc("restore_tmp.validate_run", { p_run_id: runId });
  if (ve) throw ve;

  console.log("Validated:", v);

  if (!DRY_RUN) {
    const { data: a, error: ae } = await supabase.rpc("restore_tmp.apply_run", { p_run_id: runId, p_force: false });
    if (ae) throw ae;
    console.log("Applied:", a);
  } else {
    console.log("Dry-run: not applying.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});