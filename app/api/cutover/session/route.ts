import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) {
    return NextResponse.json({ authenticated: false }, { status: 404, headers: CUTOVER_HEADERS });
  }
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    const sql = identity ? neon(process.env.CUTOVER_AUTH_DATABASE_URL!) : null;
    const flags = identity ? await sql!`SELECT must_change_password FROM cutover_auth.participant_credentials WHERE user_id=${identity.userId}::uuid` : [];
    return NextResponse.json(identity
      ? { authenticated: true, username: identity.username, role: identity.role, must_change_password: flags[0]?.must_change_password === true }
      : { authenticated: false }, {
      status: identity ? 200 : 401, headers: CUTOVER_HEADERS
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
