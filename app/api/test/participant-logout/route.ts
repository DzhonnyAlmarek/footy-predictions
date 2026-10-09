import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { AUTH_HEADERS, PARTICIPANT_COOKIE, participantAuthEnabled,
  participantDatabase, participantOriginAllowed } from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!participantAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: AUTH_HEADERS });
  if (!participantOriginAllowed(req)) return NextResponse.json({ ok: false }, { status: 403, headers: AUTH_HEADERS });
  const token = req.cookies.get(PARTICIPANT_COOKIE)?.value;
  if (token && /^[a-f0-9]{64}$/i.test(token)) {
    try {
      const hash = hashOpaqueToken(token);
      const sql = participantDatabase();
      await sql`UPDATE test_auth.participant_sessions SET revoked_at = now()
        WHERE session_hash = decode(${hash}, 'hex') AND revoked_at IS NULL`;
    } catch {
      // Fail closed: do not declare logout success if server-side revocation failed.
      return NextResponse.json({ ok: false }, { status: 503, headers: AUTH_HEADERS });
    }
  }
  const response = NextResponse.json({ ok: true }, { headers: AUTH_HEADERS });
  response.cookies.set(PARTICIPANT_COOKIE, "", { httpOnly: true, secure: true,
    sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
