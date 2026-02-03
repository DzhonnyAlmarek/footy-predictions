// app/api/predictions/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export async function POST(req: Request) {
  try {
    const cookieStore = cookies();

    // ✅ создаём response ОДИН раз — и в него supabase сможет писать cookies
    const res = NextResponse.json({ ok: true });

    const supabase = createServerClient(
      mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
      mustEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            // ✅ критично: если Supabase обновляет/рефрешит токены — они должны уйти в ответ
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, {
                ...(options ?? {}),
                path: options?.path ?? "/", // ✅ на всякий случай
              });
            });
          },
        },
      }
    );

    // ✅ проверка авторизации
    const { data: u, error: uErr } = await supabase.auth.getUser();
    if (uErr) {
      return NextResponse.json({ error: uErr.message }, { status: 401 });
    }
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

    const { error } = await supabase
      .from("predictions")
      .upsert(
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

    // ✅ возвращаем тот самый res, куда могли быть записаны обновлённые cookies
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "bad_request" }, { status: 400 });
  }
}
