import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const HEADERS = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" };
const ALLOWED_DB = new Set([
  "ep-holy-smoke-b1y4pzhn.c-5.eu-central-1.aws.neon.tech",
  "ep-holy-smoke-b1y4pzhn-pooler.c-5.eu-central-1.aws.neon.tech"
]);
export async function GET(req: Request) {
  const db = process.env.DATABASE_URL || "";
  let dbHost = "";
  try { dbHost = new URL(db).hostname; } catch {}
  const host = req.headers.get("host");
  const codespaceHost = process.env.CODESPACE_NAME
    ? `${process.env.CODESPACE_NAME}-3100.app.github.dev` : "";
  if (process.env.NODE_ENV !== "development" ||
      process.env.DEPLOY_TARGET !== "yandex-neon-test" ||
      process.env.LOCAL_NEON_AUTH_E2E !== "true" ||
      !(host === "127.0.0.1:3100" ||
        (Boolean(codespaceHost) && (host === codespaceHost || host === "localhost:3100"))) ||
      !ALLOWED_DB.has(dbHost)) {
    return NextResponse.json({ ok: false }, { status: 404, headers: HEADERS });
  }
  try {
    const sql = neon(db);
    const stages = await sql`
      SELECT id,name,is_current
      FROM migration_source.stages ORDER BY id ASC LIMIT 30`;
    const requested = new URL(req.url).searchParams.get("stage");
    const selected = requested
      ? stages.find(s => String(s.id) === requested)
      : stages.find(s => s.is_current);
    if (!selected) {
      return NextResponse.json({ ok: false, error: "unknown_stage" },
        { status: 400, headers: HEADERS });
    }
    const rows = await sql`
      SELECT p.username, COUNT(l.id)::integer AS predictions_scored,
             COALESCE(SUM(l.points),0) AS points,
             COALESCE(SUM(l.points_outcome),0) AS points_outcome,
             COALESCE(SUM(l.points_diff),0) AS points_diff,
             COALESCE(SUM(l.points_h1+l.points_h2+l.points_bonus),0) AS points_other
      FROM migration_source.profiles p
      JOIN migration_source.points_ledger l ON l.user_id=p.id
      JOIN migration_source.matches m ON m.id=l.match_id
      WHERE m.stage_id=${selected.id}
        AND p.username IS NOT NULL
        AND p.role <> 'admin'
      GROUP BY p.id,p.username
      ORDER BY points DESC, predictions_scored DESC, p.username ASC
      LIMIT 100`;
    return NextResponse.json({ok:true,source:"neon-migration-work",
      note:"Preliminary ranking sorted by total points; official tie-breaks unverified",
      selected_stage:selected,stages,rows}, {headers:HEADERS});
  } catch {
    return NextResponse.json({ok:false,error:"neon_standings_unavailable"},
      {status:503,headers:HEADERS});
  }
}
