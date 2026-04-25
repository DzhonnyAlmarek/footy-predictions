import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

type TeamMaybeArray = { name: string } | { name: string }[] | null;

type MatchRow = {
  id: string;
  stage_match_no?: number | null;
  home_score: number | null;
  away_score: number | null;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

type UserRow = { login: string; user_id: string };

type Pred = { h: number | null; a: number | null };

function teamName(t: TeamMaybeArray): string {
  if (!t) return "?";
  if (Array.isArray(t)) return t[0]?.name ?? "?";
  return t.name ?? "?";
}

function formatPts(n: number): string {
  const x = Math.round(n * 100) / 100;
  return Number.isInteger(x) ? String(x) : String(x);
}

export default async function ArchiveStagePage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const { stageId } = await params;
  const sid = Number(stageId);
  if (!Number.isFinite(sid)) redirect("/dashboard/archive");

  const sb = service();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("id", sid)
    .maybeSingle();

  if (!stage || stage.status !== "locked") {
    return (
      <main className="page">
        <h1>Архив</h1>
        <p>Этап не найден или ещё не завершён</p>
        <Link href="/dashboard/archive">← Назад</Link>
      </main>
    );
  }

  const { data: usersRaw } = await sb
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login");

  const users = (usersRaw ?? []) as UserRow[];
  const userIds = users.map((u) => u.user_id);

  const { data: matchesRaw } = await sb
    .from("matches")
    .select(`
      id,
      stage_match_no,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `)
    .eq("stage_id", sid)
    .order("stage_match_no", { ascending: true });

  const matches = (matchesRaw ?? []) as MatchRow[];
  const matchIds = matches.map((m) => Number(m.id));

  const { data: predsRaw } = await sb
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const predByMatchUser = new Map<number, Map<string, Pred>>();
  for (const p of predsRaw ?? []) {
    const mid = Number((p as any).match_id);
    if (!predByMatchUser.has(mid)) predByMatchUser.set(mid, new Map());
    predByMatchUser.get(mid)!.set(String((p as any).user_id), {
      h: (p as any).home_pred,
      a: (p as any).away_pred,
    });
  }

  const totalByUser = new Map<string, number>();
  for (const u of users) totalByUser.set(u.user_id, 0);

  for (const m of matches) {
    if (m.home_score == null || m.away_score == null) continue;

    const mid = Number(m.id);

    for (const u of users) {
      const pr = predByMatchUser.get(mid)?.get(u.user_id);
      if (!pr || pr.h == null || pr.a == null) continue;

      let pts = 0;

      if (pr.h === m.home_score && pr.a === m.away_score) pts += 3;
      else {
        const resSign = Math.sign(m.home_score - m.away_score);
        const prSign = Math.sign(pr.h - pr.a);
        if (resSign === prSign) pts += 2;

        const resDiff = m.home_score - m.away_score;
        const prDiff = pr.h - pr.a;
        if (resDiff === prDiff) pts += 1;
      }

      totalByUser.set(u.user_id, (totalByUser.get(u.user_id) ?? 0) + pts);
    }
  }

  const sortedUsers = [...users].sort(
    (a, b) =>
      (totalByUser.get(b.user_id) ?? 0) -
      (totalByUser.get(a.user_id) ?? 0)
  );

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1>Архивная таблица</h1>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href={`/dashboard/archive/${sid}/golden-boot`}>
            Золотая бутса →
          </Link>

          <Link href="/dashboard/archive">← Назад к архиву</Link>
        </div>
      </div>

      <div className="pageMeta">
        Этап: <b>{stage.name}</b> • завершён
      </div>

      <div className="tableWrap">
        <table className="table currentTable">
          <thead>
            <tr>
              <th style={{ width: 60 }}>№</th>
              <th>Участник</th>
              <th style={{ textAlign: "right" }}>Очки</th>
            </tr>
          </thead>

          <tbody>
            {sortedUsers.map((u, idx) => (
              <tr key={u.user_id}>
                <td style={{ fontWeight: 900 }}>{idx + 1}</td>
                <td>{u.login}</td>
                <td style={{ textAlign: "right", fontWeight: 900 }}>
                  {formatPts(totalByUser.get(u.user_id) ?? 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}