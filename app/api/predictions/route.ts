import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isInt(n: any) {
  return Number.isInteger(n);
}

export async function POST(req: Request) {
  const supabase = await createClient();

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    return NextResponse.json({ error: userErr.message }, { status: 401 });
  }
  const user = userData.user;
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const matchId = body?.matchId;
  const homePred = body?.homePred;
  const awayPred = body?.awayPred;

  if (!matchId) return NextResponse.json({ error: "matchId_required" }, { status: 400 });

  const hp = Number(homePred);
  const ap = Number(awayPred);

  if (!isInt(hp) || !isInt(ap) || hp < 0 || ap < 0 || hp > 30 || ap > 30) {
    return NextResponse.json({ error: "invalid_score" }, { status: 400 });
  }

  // дедлайн: нельзя менять после deadline_at (если он задан)
  const { data: matchRow, error: matchErr } = await supabase
    .from("matches")
    .select("deadline_at")
    .eq("id", matchId)
    .maybeSingle();

  if (matchErr) return NextResponse.json({ error: matchErr.message }, { status: 500 });
  if (!matchRow) return NextResponse.json({ error: "match_not_found" }, { status: 404 });

  if (matchRow.deadline_at) {
    const deadline = new Date(matchRow.deadline_at);
    if (!Number.isNaN(deadline.getTime()) && Date.now() > deadline.getTime()) {
      return NextResponse.json({ error: "deadline_passed" }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from("predictions")
    .upsert(
      {
        match_id: matchId,
        user_id: user.id,
        home_pred: hp,
        away_pred: ap,
      },
      { onConflict: "match_id,user_id" }
    );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
