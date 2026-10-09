import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/participant-auth-tokens";
import { AUTH_HEADERS, PARTICIPANT_COOKIE, participantAuthEnabled,
  participantDatabase } from "@/lib/neon-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!participantAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: AUTH_HEADERS });
  const token = request.cookies.get(PARTICIPANT_COOKIE)?.value;
  if (!token || !/^[a-f0-9]{64}$/i.test(token)) {
    return NextResponse.json({ authenticated: false }, { headers: AUTH_HEADERS });
  }
  try {
    const hash = hashOpaqueToken(token);
    const sql = participantDatabase();
    const row = await sql`SELECT test_auth.session_user(decode(${hash}, 'hex')) AS user_id`;
    if (typeof row[0]?.user_id !== "string") {
      return NextResponse.json({ authenticated: false }, { headers: AUTH_HEADERS });
    }
    const profiles = await sql`SELECT username FROM migration_source.profiles WHERE id = ${row[0].user_id}::uuid LIMIT 1`;
    if (profiles.length !== 1 || typeof profiles[0]?.username !== "string") {
      return NextResponse.json({ authenticated: false }, { headers: AUTH_HEADERS });
    }
    return NextResponse.json({ authenticated: true, username: profiles[0].username }, { headers: AUTH_HEADERS });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 503, headers: AUTH_HEADERS });
  }
}
