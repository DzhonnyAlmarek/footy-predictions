import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, verifyTestSession } from "@/lib/test-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  if (process.env.DEPLOY_TARGET !== "yandex-neon-test") {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const authenticated = await verifyTestSession(req.cookies.get(COOKIE_NAME)?.value);
  return NextResponse.json({ authenticated }, { headers: { "Cache-Control": "no-store" } });
}
