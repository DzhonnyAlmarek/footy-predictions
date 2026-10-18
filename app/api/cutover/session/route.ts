import { NextRequest, NextResponse } from "next/server";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) {
    return NextResponse.json({ authenticated: false }, { status: 404, headers: CUTOVER_HEADERS });
  }
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    return NextResponse.json(identity
      ? { authenticated: true, username: identity.username, role: identity.role }
      : { authenticated: false }, {
      status: identity ? 200 : 401, headers: CUTOVER_HEADERS
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
