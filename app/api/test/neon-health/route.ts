import { neon } from "@neondatabase/serverless";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Isolated test-only connectivity probe. Never return credentials or raw DB errors.
export async function GET() {
  const headers = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test") {
    return NextResponse.json({ ok: false }, { status: 404, headers });
  }

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return NextResponse.json(
      { ok: false, environment: "isolated-test", database: "not-configured" },
      { status: 503, headers }
    );
  }

  try {
    const sql = neon(connectionString);
    const rows = await sql`SELECT 1 AS connected`;
    if (rows.length !== 1 || Number(rows[0]?.connected) !== 1) {
      throw new Error("Unexpected query result");
    }
    return NextResponse.json(
      { ok: true, environment: "isolated-test", database: "connected" },
      { headers }
    );
  } catch {
    return NextResponse.json(
      { ok: false, environment: "isolated-test", database: "unavailable" },
      { status: 503, headers }
    );
  }
}
