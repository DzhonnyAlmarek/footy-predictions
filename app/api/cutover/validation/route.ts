import { NextResponse } from "next/server";
import { cutoverSnapshotSummary, cutoverPredictionCoverage } from "@/lib/cutover-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A single read-only status endpoint for the migration preview UI.
// It never accepts a user ID or exposes individual predictions.
export async function GET(request: Request) {
  const token = process.env.CUTOVER_PREVIEW_CHECK_TOKEN;
  if (process.env.DEPLOY_TARGET !== "yandex-neon-cutover-preview" ||
      process.env.ENABLE_CUTOVER_PREVIEW !== "true" ||
      !token || token.length < 32 ||
      request.headers.get("x-cutover-check-token") !== token) {
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const [counts, coverage] = await Promise.all([
      cutoverSnapshotSummary(), cutoverPredictionCoverage()
    ]);
    return NextResponse.json({
      ok: true, historical_snapshot: true, counts, coverage: coverage[0],
      ready_for_cutover: false
    }, { headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
  } catch {
    return NextResponse.json({ ok: false, error: "preview_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
