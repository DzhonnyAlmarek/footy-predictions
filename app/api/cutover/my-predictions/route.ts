import { NextRequest, NextResponse } from "next/server";
import { authenticatedCutoverParticipant, cutoverAuthEnabled,
  cutoverOwnPredictions, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const userId = await authenticatedCutoverParticipant(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!userId) return NextResponse.json({ ok: false, error: "unauthorized" },
      { status: 401, headers: CUTOVER_HEADERS });
    const predictions = await cutoverOwnPredictions(userId);
    return NextResponse.json({ ok: true, snapshot: true, predictions }, { headers: CUTOVER_HEADERS });
  } catch {
    return NextResponse.json({ ok: false, error: "unavailable" },
      { status: 503, headers: CUTOVER_HEADERS });
  }
}
