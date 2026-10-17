import { neon } from "@neondatabase/serverless";

// Cutover preview uses a dedicated database connection and NEVER writes to it.
// This module deliberately does not expose the SQL client to route handlers.
function previewDatabase() {
  const raw = process.env.CUTOVER_PREVIEW_DATABASE_URL;
  if (process.env.DEPLOY_TARGET !== "yandex-neon-cutover-preview" ||
      process.env.ENABLE_CUTOVER_PREVIEW !== "true" || !raw) {
    throw new Error("cutover preview disabled");
  }
  const url = new URL(raw);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname.endsWith(".neon.tech") ||
      !["require", "verify-full"].includes(url.searchParams.get("sslmode") || "") ||
      url.hostname.startsWith("ep-holy-smoke-b1y4pzhn")) {
    throw new Error("invalid cutover preview database");
  }
  return neon(raw);
}

export async function cutoverSnapshotSummary() {
  const sql = previewDatabase();
  const rows = await sql`
    SELECT
      (SELECT count(*)::int FROM footy_cutover.profiles) AS participants,
      (SELECT count(*)::int FROM footy_cutover.matches) AS matches,
      (SELECT count(*)::int FROM footy_cutover.predictions) AS predictions,
      (SELECT count(*)::int FROM footy_cutover.points_ledger) AS ledger_entries
  `;
  return rows[0];
}
