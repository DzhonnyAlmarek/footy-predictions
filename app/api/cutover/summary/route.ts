import { NextResponse } from "next/server";
import { cutoverSnapshotSummary } from "@/lib/cutover-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// No user data exposed; this endpoint is disabled unless explicitly configured.
// Keep the access token out of logs and URLs.
export async function GET(request: Request) {
  const configured = process.env.CUTOVER_PREVIEW_CHECK_TOKEN;
  const supplied = request.headers.get("x-cutover-check-token");
  if (process.env.DEPLOY_TARGET !== "yandex-neon-cutover-preview" ||
      process.env.ENABLE_CUTOVER_PREVIEW !== "true" ||
      !configured || configured.length < 32 || !supplied || supplied !== configured) {
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const counts = await cutoverSnapshotSummary();
    return NextResponse.json({ ok: true, snapshot: true, counts },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "preview_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
