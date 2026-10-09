import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const ALLOWED_HOSTS = new Set([
  "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
  "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech",
]);

// Read-only preview of migrated competition history. No predictions or participant records.
// The middleware exposes this route ONLY to an explicit loopback development session.
export async function GET(request: Request) {
  const url = process.env.DATABASE_URL;
  let neonHost = "";
  try { neonHost = new URL(url || "").hostname; } catch { /* disabled */ }
  if (process.env.NODE_ENV !== "development" ||
      process.env.LOCAL_NEON_AUTH_E2E !== "true" ||
      process.env.DEPLOY_TARGET !== "yandex-neon-test" ||
      !(
        request.headers.get("host") === "127.0.0.1:3100" ||
        (Boolean(process.env.CODESPACE_NAME) &&
         request.headers.get("host") === `${process.env.CODESPACE_NAME}-3100.app.github.dev`)
      ) ||
      !ALLOWED_HOSTS.has(neonHost)) {
    return NextResponse.json({ ok: false }, { status: 404, headers: HEADERS });
  }
  try {
    const sql = neon(url!);
    const [stages, tours, matches] = await Promise.all([
      sql`SELECT id, name, status, is_current
          FROM migration_source.stages ORDER BY id ASC LIMIT 50`,
      sql`SELECT id, stage_id, tour_no, name
          FROM migration_source.tours ORDER BY stage_id ASC, id ASC LIMIT 200`,
      sql`SELECT m.id, m.stage_id, m.tour_id, m.kickoff_at,
                  m.deadline_at, m.status, m.home_score, m.away_score,
                  h.name AS home_team, a.name AS away_team
          FROM migration_source.matches m
          LEFT JOIN migration_source.teams h ON h.id = m.home_team_id
          LEFT JOIN migration_source.teams a ON a.id = m.away_team_id
          ORDER BY m.kickoff_at ASC NULLS LAST, m.id ASC LIMIT 1000`,
    ]);
    return NextResponse.json(
      { ok: true, source: "neon-migration-work", stages, tours, matches,
        counts: { stages: stages.length, tours: tours.length, matches: matches.length } },
      { headers: HEADERS },
    );
  } catch {
    return NextResponse.json({ ok: false, error: "migration_preview_unavailable" },
      { status: 503, headers: HEADERS });
  }
}
