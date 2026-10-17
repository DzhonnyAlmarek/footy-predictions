import { NextResponse } from "next/server";
import { cutoverPredictionCoverage } from "@/lib/cutover-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const token = process.env.CUTOVER_PREVIEW_CHECK_TOKEN;
  if (process.env.DEPLOY_TARGET !== "yandex-neon-cutover-preview" ||
      process.env.ENABLE_CUTOVER_PREVIEW !== "true" ||
      !token || token.length < 32 ||
      request.headers.get("x-cutover-check-token") !== token) {
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const rows = await cutoverPredictionCoverage();
    return NextResponse.json({ ok: true, snapshot: true, coverage: rows[0] },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "preview_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
