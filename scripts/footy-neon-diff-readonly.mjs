// Read-only Supabase -> isolated Neon comparison. No database writes.
import { createClient } from "@supabase/supabase-js";
import { neon } from "@neondatabase/serverless";

const hostAllowlist = new Set([
  "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
  "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech"
]);
const sourceUrl = process.env.FOOTY_SOURCE_SUPABASE_URL;
const sourceKey = process.env.FOOTY_SOURCE_SUPABASE_READ_KEY;
const destinationUrl = process.env.FOOTY_TEST_NEON_DATABASE_URL;
if (!sourceUrl || !sourceKey || !destinationUrl) {
  throw new Error("Missing dedicated sync secrets; no operations executed");
}
if (!hostAllowlist.has(new URL(destinationUrl).hostname)) {
  throw new Error("Neon endpoint is not the isolated migration branch");
}
if (new URL(sourceUrl).protocol !== "https:") {
  throw new Error("Source Supabase URL must use HTTPS");
}
const source = createClient(sourceUrl, sourceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});
const target = neon(destinationUrl);
const PAGE_SIZE = 500;
const TABLES = ["matches", "predictions", "points_ledger"];

async function sourceRows(table) {
  const result = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await source.from(table).select("*")
      .order("id", { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error("Supabase read failed for " + table + ": " + error.code);
    result.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return result;
}

async function targetRows(table) {
  const result = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    let batch;
    if (table === "matches") batch = await target`SELECT to_jsonb(t) AS row FROM migration_source.matches t ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    else if (table === "predictions") batch = await target`SELECT to_jsonb(t) AS row FROM migration_source.predictions t ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    else batch = await target`SELECT to_jsonb(t) AS row FROM migration_source.points_ledger t ORDER BY id LIMIT ${PAGE_SIZE} OFFSET ${offset}`;
    result.push(...batch.map(r => r.row));
    if (batch.length < PAGE_SIZE) break;
  }
  return result;
}

function normalized(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return String(value);
  if (typeof value === "string") {
    if (/^\\d{4}-\\d\\d-\\d\\d[ T]\\d\\d:\\d\\d:\\d\\d/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toISOString();
    }
    if (/^-?\\d+(?:\\.\\d+)?$/.test(value)) return String(Number(value));
    return value;
  }
  return value;
}
function canonical(row) {
  return JSON.stringify(Object.keys(row).sort().map(k => [k, normalized(row[k])]));
}
let differences = 0;
for (const table of TABLES) {
  const [a, b] = await Promise.all([sourceRows(table), targetRows(table)]);
  const S = new Map(a.map(r => [String(r.id), r]));
  const N = new Map(b.map(r => [String(r.id), r]));
  const missing = [...S.keys()].filter(id => !N.has(id));
  const changed = [...S.keys()].filter(id => N.has(id) && canonical(S.get(id)) !== canonical(N.get(id)));
  const extra = [...N.keys()].filter(id => !S.has(id));
  differences += missing.length + changed.length + extra.length;
  console.log(JSON.stringify({
    table, source: S.size, neon: N.size,
    new_in_source: missing.length, changed: changed.length, only_neon: extra.length,
    new_ids: missing.slice(0, 50), changed_ids: changed.slice(0, 50),
    only_neon_ids: extra.slice(0, 50)
  }));
}
console.log("DRY_RUN_ONLY: true; total_differences:", differences);
