// Manual, isolated Supabase -> Neon sync. Never writes to source. Default: dry-run.
import pg from "pg";

const branchHost = new Set([
  "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
  "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech",
]);
const sourceUri = process.env.FOOTY_SOURCE_SUPABASE_DATABASE_URL;
const targetUri = process.env.FOOTY_TEST_NEON_DATABASE_URL;
const cert = process.env.FOOTY_SOURCE_SUPABASE_CA_CERT;
const mode = process.env.FOOTY_SYNC_MODE || "dry-run";
if (!["dry-run", "apply"].includes(mode)) throw Error("Invalid mode");
if (!sourceUri || !targetUri || !cert) throw Error("Missing connection secrets");
const srcUrl = new URL(sourceUri);
const dstUrl = new URL(targetUri);
const project = "dfcfixmvplkhkaayfbbd";
const direct = srcUrl.hostname === "db." + project + ".supabase.co" && srcUrl.username === "footy_migration_reader";
const pooler = srcUrl.hostname.endsWith(".pooler.supabase.com") && srcUrl.username === "footy_migration_reader." + project;
if (!(direct || pooler)) throw Error("Source must use dedicated read-only user");
const targetKind = process.env.FOOTY_SYNC_TARGET || "migration";
const validationHosts = new Set(["ep-cool-resonance-b1a56z1z.c-5.eu-central-1.aws.neon.tech", "ep-cool-resonance-b1a56z1z-pooler.c-5.eu-central-1.aws.neon.tech"]);
if (targetKind === "validation") {
  if (!validationHosts.has(dstUrl.hostname)) {
    console.error("NEON_TARGET_HOST_CHECK:", JSON.stringify({expected: [...validationHosts], actual_hostname: dstUrl.hostname, actual_port: dstUrl.port || "default"}));
    throw Error("Validation target must use dedicated Neon host");
  }
  if (mode === "apply" && process.env.FOOTY_SYNC_CONFIRM !== "APPLY-VALIDATION-ONLY") throw Error("Validation approval missing");
} else if (targetKind === "migration") {
  if (!branchHost.has(dstUrl.hostname)) throw Error("Neon host not in isolated migration branch allowlist");
} else {
  throw Error("Invalid sync target");
}
if (mode === "apply" && targetKind === "migration" && process.env.FOOTY_SYNC_CONFIRM !== "APPLY-ISOLATED-NEON") throw Error("Manual confirmation missing");
srcUrl.searchParams.delete("sslmode");
srcUrl.searchParams.delete("sslrootcert");
const source = new pg.Client({ connectionString: srcUrl.toString(), ssl: { ca: cert.replace(/\\n/g, "\n"), rejectUnauthorized: true }, connectionTimeoutMillis: 15000 });
const dest = new pg.Client({ connectionString: targetUri, connectionTimeoutMillis: 15000 });
const tables = {
  matches: ["tournament_id", "home_team_id", "away_team_id", "kickoff_at", "deadline_at", "status", "home_score", "away_score", "created_at", "stage_id", "tour_id", "stage_match_no", "home_penalty_goals", "away_penalty_goals"],
  predictions: ["match_id", "user_id", "home_pred", "away_pred", "created_at", "updated_at"],
  points_ledger: ["user_id", "match_id", "points", "reason", "created_at", "points_outcome", "points_diff", "points_h1", "points_h2", "points_bonus", "points_outcome_base", "points_outcome_bonus", "points_diff_base", "points_diff_bonus"],
};
function canonical(row) {
  return JSON.stringify(Object.keys(row).sort().map(k => {
    let v = row[k];
    if (v instanceof Date) v = v.toISOString();
    else if (typeof v === "string" && /^-?\\d+(?:\\.\\d+)?$/.test(v)) v = String(Number(v));
    else if (typeof v === "string" && /^\\d{4}-\\d\\d-\\d\\d[ T]\\d\\d:\\d\\d:\\d\\d/.test(v)) {
      const d = new Date(v); if (!Number.isNaN(d.getTime())) v = d.toISOString();
    }
    return [k, v];
  }));
}
async function rows(client, schema, table) {
  const { rows } = await client.query(`SELECT row_to_json(t) AS row FROM ${schema}.${table} t ORDER BY id`);
  return rows.map(r => r.row);
}
let transactionOpen = false;
const report = [];
let totalAdded = 0;
let totalUpdated = 0;
await source.connect();
try {
  await source.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await dest.connect();
  try {
    // A single serialized run; rollback on any error.
    await dest.query("BEGIN");
    transactionOpen = true;
    await dest.query("SELECT pg_advisory_xact_lock(724106, 14)");
    for (const [table, columns] of Object.entries(tables)) {
      const [incoming, existing] = await Promise.all([rows(source, "public", table), rows(dest, "migration_source", table)]);
      const S = new Map(incoming.map(r => [String(r.id), r]));
      const N = new Map(existing.map(r => [String(r.id), r]));
      const missing = incoming.filter(r => !N.has(String(r.id)));
      const modified = incoming.filter(r => N.has(String(r.id)) && canonical(r) !== canonical(N.get(String(r.id))));
      const extra = existing.filter(r => !S.has(String(r.id)));
      console.log(JSON.stringify({ table, source: incoming.length, neon: existing.length, missing: missing.length, changed: modified.length, only_neon: extra.length }));
      report.push({ table, added: missing.length, updated: modified.length });
      totalAdded += missing.length;
      totalUpdated += modified.length;
      if (extra.length) throw Error(table + ": unexpected Neon-only rows; refusing to modify");
      if (missing.length + modified.length > 200) throw Error(table + ": drift over 200 rows; manual review required");
      if (mode === "apply" && (missing.length || modified.length)) {
        const payload = JSON.stringify([...missing, ...modified]);
        const names = ["id", ...columns].join(", ");
        const changes = columns.map(c => `${c}=EXCLUDED.${c}`).join(", ");
        const sql = `INSERT INTO migration_source.${table} (${names}) SELECT ${names} FROM jsonb_populate_recordset(NULL::migration_source.${table}, $1::jsonb) ON CONFLICT (id) DO UPDATE SET ${changes}`;
        await dest.query(sql, [payload]);
      }
    }
    if (mode === "apply") {
      // Source-to-target check before committing.
      for (const table of Object.keys(tables)) {
        const [a, b] = await Promise.all([rows(source, "public", table), rows(dest, "migration_source", table)]);
        if (a.length !== b.length || a.some((r, i) => String(r.id) !== String(b[i].id) || canonical(r) !== canonical(b[i]))) {
          throw Error("Post-write verification failed for " + table + "; rolling back");
        }
      }
      await dest.query("COMMIT");
      transactionOpen = false;
      console.log("APPLIED_AND_VERIFIED: true");
      console.log("SYNC_SUMMARY:", JSON.stringify({mode, totalAdded, totalUpdated, report}));
    } else {
      await dest.query("ROLLBACK");
      transactionOpen = false;
      console.log("DRY_RUN_ONLY: true");
      console.log("SYNC_SUMMARY:", JSON.stringify({mode, totalAdded, totalUpdated, report}));
    }
  } finally {
    if (transactionOpen) await dest.query("ROLLBACK").catch(() => {});
    await dest.end();
  }
} finally {
  await source.query("ROLLBACK").catch(() => {});
  await source.end();
}
