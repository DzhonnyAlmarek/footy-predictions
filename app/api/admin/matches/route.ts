import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const cs = await cookies();
  const raw = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(raw).trim().toUpperCase();

  if (fpLogin !== "ADMIN") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "not_auth" }, { status: 401 }),
    };
  }
  return { ok: true };
}

/** GET /api/admin/matches?stage_id=123 */
export async function GET(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const url = new URL(req.url);
  const stageIdRaw = url.searchParams.get("stage_id");

  const sb = service();

  let q = sb
    .from("matches")
    .select(
      `
      id,
      stage_id,
      stage_match_no,
      kickoff_at,
      deadline_at,
      status,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    );

  if (stageIdRaw) q = q.eq("stage_id", Number(stageIdRaw));

  // ✅ сортировка: сначала порядковый номер матча этапа, потом дата
  const { data, error } = await q
    .order("stage_match_no", { ascending: true, nullsFirst: false })
    .order("kickoff_at", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, matches: data ?? [] });
}

type PatchBody = {
  id: number;
  home_score: number | null;
  away_score: number | null;
  status?: string | null;
};

/** PATCH /api/admin/matches  body: {id, home_score, away_score, status?} */
export async function PATCH(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const body = (await req.json().catch(() => null)) as PatchBody | null;
  if (!body?.id) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();

  const upd: any = {
    home_score: body.home_score,
    away_score: body.away_score,
  };
  if (body.status != null) upd.status = body.status;

  // ✅ важно: делаем select, чтобы увидеть что реально обновилось (иначе можно получить “успех” при 0 строк)
  const { data, error } = await sb
    .from("matches")
    .update(upd)
    .eq("id", body.id)
    .select("id,home_score,away_score,status")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!data?.id) {
    return NextResponse.json({ ok: false, error: "not_updated" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, match: data });
}

/** (опционально) POST /api/admin/matches — если у тебя используется создание матчей */
export async function POST(req: Request) {
  const adm = await requireAdmin();
  if (!adm.ok) return adm.res;

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return NextResponse.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  const sb = service();

  const { data, error } = await sb.from("matches").insert(payload).select("*");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, data });
}
