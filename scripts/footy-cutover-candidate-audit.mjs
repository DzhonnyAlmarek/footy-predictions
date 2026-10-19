// Read-only pre-cutover audit: Supabase public -> isolated Neon footy_cutover.
// No writes, no DDL, no changes to existing scheduled synchronization.
// Run with FOOTY_SOURCE_SUPABASE_DATABASE_URL and FOOTY_CANDIDATE_NEON_DATABASE_URL.
// Source credential must be footy_migration_reader; candidate host is pinned.
import pg from "pg";

const sourceUrl = process.env.FOOTY_SOURCE_SUPABASE_DATABASE_URL;
const targetUrl = process.env.FOOTY_CANDIDATE_NEON_DATABASE_URL;
const ca = process.env.FOOTY_SOURCE_SUPABASE_CA_CERT;
if (!sourceUrl || !targetUrl || !ca) throw Error("Missing source, candidate, or CA credentials");
const source = new URL(sourceUrl);
const target = new URL(targetUrl);
const sourceProject = "dfcfixmvplkhkaayfbbd";
const sourceDirect = source.hostname === `db.${sourceProject}.supabase.co` && source.username === "footy_migration_reader";
const sourcePool = source.hostname.endsWith(".pooler.supabase.com") && source.username === `footy_migration_reader.${sourceProject}`;
if (!sourceDirect && !sourcePool) throw Error("Source must be dedicated read-only user");
if (target.hostname !== "ep-divine-rain-b1d1r892.c-5.eu-central-1.aws.neon.tech" &&
    target.hostname !== "ep-divine-rain-b1d1r892-pooler.c-5.eu-central-1.aws.neon.tech")
  throw Error("Target must be the explicitly pinned isolated candidate branch");
source.searchParams.delete("sslmode");
source.searchParams.delete("sslrootcert");
const src = new pg.Client({connectionString: source.toString(), ssl: {ca: ca.replace(/\\n/g, "\n"), rejectUnauthorized: true}, connectionTimeoutMillis: 15000});
const dst = new pg.Client({connectionString: targetUrl, connectionTimeoutMillis: 15000});
const tables = ["matches", "predictions", "points_ledger"];
function canonical(obj) {
  return JSON.stringify(Object.entries(obj).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => [k,v]));
}
async function fetchRows(client, schema, table) {
  const result = await client.query(`SELECT row_to_json(t) AS value FROM ${schema}.${table} t ORDER BY id`);
  return new Map(result.rows.map(({value}) => [String(value.id), value]));
}
await src.connect();
try {
  await src.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await dst.connect();
  try {
    await dst.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    let hasDifferences = false;
    for (const table of tables) {
      const a = await fetchRows(src, "public", table);
      const b = await fetchRows(dst, "footy_cutover", table);
      const sourceOnly = [...a.keys()].filter(id => !b.has(id));
      const candidateOnly = [...b.keys()].filter(id => !a.has(id));
      const changed = [...a.keys()].filter(id => b.has(id) && canonical(a.get(id)) !== canonical(b.get(id)));
      if (table === "matches") {
        for (const id of changed.slice(0, 10)) {
          const aRow = a.get(id), bRow = b.get(id);
          const fields = [...new Set([...Object.keys(aRow), ...Object.keys(bRow)])].filter(k => canonical({v:aRow[k]}) !== canonical({v:bRow[k]}));
          console.log(JSON.stringify({detail:"match_changed_fields",id,fields,values:Object.fromEntries(fields.map(f=>[f,{source:aRow[f],candidate:bRow[f]}]))}));
        }
      }
      if (table === "points_ledger") {
        const key = r => String(r.match_id) + ":" + String(r.user_id);
        const group = rows => {
          const out = new Map();
          for (const row of rows.values()) {
            const k = key(row);
            if (!out.has(k)) out.set(k, []);
            const {id, ...value} = row;
            out.get(k).push(value);
          }
          return out;
        };
        const aa=group(a), bb=group(b);
        const onlyA=[...aa.keys()].filter(k=>!bb.has(k));
        const onlyB=[...bb.keys()].filter(k=>!aa.has(k));
        const changedKeys=[...aa.keys()].filter(k=>bb.has(k) && canonical({rows:aa.get(k)}) !== canonical({rows:bb.get(k)}));
        console.log(JSON.stringify({detail:"ledger_business_keys",source_only:onlyA,candidate_only:onlyB,changed:changedKeys.slice(0,50),changed_count:changedKeys.length}));
        for (const k of changedKeys.slice(0,30)) {
          const left=aa.get(k)[0],right=bb.get(k)[0];
          const fields=[...new Set([...Object.keys(left),...Object.keys(right)])].filter(f=>canonical({v:left[f]})!==canonical({v:right[f]}));
          console.log(JSON.stringify({detail:"ledger_changed_fields",key:k,fields}));
        }
      }
      hasDifferences ||= sourceOnly.length > 0 || candidateOnly.length > 0 || changed.length > 0;
      console.log(JSON.stringify({table, source_rows:a.size, candidate_rows:b.size,
        source_only_count:sourceOnly.length, candidate_only_count:candidateOnly.length,
        changed_count:changed.length,
        sample_ids:{source_only:sourceOnly.slice(0,30),candidate_only:candidateOnly.slice(0,30),changed:changed.slice(0,30)}}));
    }
    console.log(JSON.stringify({status:hasDifferences?"REVIEW_REQUIRED":"IDENTICAL",read_only:true,applied:false}));
    await dst.query("ROLLBACK");
    await src.query("ROLLBACK");
  } finally { await dst.end(); }
} finally { await src.end(); }
