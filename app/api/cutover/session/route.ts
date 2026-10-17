import { NextRequest, NextResponse } from "next/server";
import { authenticatedCutoverParticipant, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) {
    return NextResponse.json({ authenticated: false }, { status: 404, headers: CUTOVER_HEADERS });
  }
  try {
    const userId = await authenticatedCutoverParticipant(req.cookies.get(CUTOVER_COOKIE)?.value);
    return NextResponse.json({ authenticated: Boolean(userId) }, {
      status: userId ? 200 : 401, headers: CUTOVER_HEADERS
    });
  } catch {
    return NextResponse.json({ authenticated: false }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
