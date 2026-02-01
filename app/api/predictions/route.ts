import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

// auth через cookies (как у тебя в API login)
async function getAuthedSupabase() {
  const cookieStore = await cookies();

  return createServerClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {},
      },
    }
  );
}

export async function POST(req: Request) {
  const supabase = await getAuthedSupabase();
  const { data: u } = await supabase.auth.getUser();

  if (!u?.user) {
    return NextResponse.json({ error: "not_auth" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  const matchId = Number(body.match_id);
  const homePred = body.home_pred === null || body.home_pred === "" ? null : Number(body.home_pred);
  const awayPred = body.away_pred === null || body.away_pred === "" ? null : Number(body.away_pred);

  if (!Number.isFinite(matchId)) {
    return NextResponse.json({ error: "match_id_required" }, { status: 400 });
  }
  if (homePred !== null && (!Number.isFinite(homePred) || homePred < 0)) {
    return NextResponse.json({ error: "home_pred_invalid" }, { status: 400 });
  }
  if (awayPred !== null && (!Number.isFinite(awayPred) || awayPred < 0)) {
    return NextResponse.json({ error: "away_pred_invalid" }, { status: 400 });
  }

  // upsert только для текущего пользователя
  const { error } = await supabase.from("predictions").upsert(
    {
      match_id: matchId,
      user_id: u.user.id,
      home_pred: homePred,
      away_pred: awayPred,
    },
    { onConflict: "match_id,user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
