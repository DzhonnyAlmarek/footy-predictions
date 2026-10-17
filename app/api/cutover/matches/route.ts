import { NextResponse } from "next/server";
import { cutoverMatches } from "@/lib/cutover-preview";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Historical aggregate preview only: no user identities or individual predictions.
export async function GET(request: Request) {
  const token = process.env.CUTOVER_PREVIEW_CHECK_TOKEN;
  if (process.env.DEPLOY_TARGET !== "yandex-neon-cutover-preview" ||
      process.env.ENABLE_CUTOVER_PREVIEW !== "true" ||
      !token || token.length < 32 ||
      request.headers.get("x-cutover-check-token") !== token) {
    return NextResponse.json({ ok: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const raw = new URL(request.url).searchParams.get("limit") || "20";
    const limit = Number(raw);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      return NextResponse.json({ ok: false, error: "invalid_limit" }, { status: 400 });
    }
    const matches = await cutoverMatches(limit);
    return NextResponse.json({ ok: true, snapshot: true, matches },
      { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "preview_unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
