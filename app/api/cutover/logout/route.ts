import { NextRequest, NextResponse } from "next/server";
import { CUTOVER_COOKIE, CUTOVER_HEADERS, cutoverAuthEnabled } from "@/lib/cutover-participant-server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { neon } from "@neondatabase/serverless";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!cutoverAuthEnabled()) {
    return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  }
  const origin = process.env.CUTOVER_AUTH_ORIGIN;
  if (!origin || !origin.startsWith("https://") || req.headers.get("origin") !== origin) {
    return NextResponse.json({ ok: false }, { status: 403, headers: CUTOVER_HEADERS });
  }
  const token = req.cookies.get(CUTOVER_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    try {
      const hash = hashOpaqueToken(token);
      const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
      await sql`UPDATE cutover_auth.participant_sessions
        SET revoked_at = now()
        WHERE session_hash = decode(${hash}, 'hex') AND revoked_at IS NULL`;
    } catch {
      return NextResponse.json({ ok: false, error: "unavailable" },
        { status: 503, headers: CUTOVER_HEADERS });
    }
  }
  const response = NextResponse.json({ ok: true }, { headers: CUTOVER_HEADERS });
  response.cookies.set(CUTOVER_COOKIE, "", {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", maxAge: 0
  });
  return response;
}
