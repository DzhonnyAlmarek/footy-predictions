import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Liveness only: deliberately performs no database or external API calls.
export async function GET() {
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json(
    { ok: true, environment: "isolated-test", database: "not-connected" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
