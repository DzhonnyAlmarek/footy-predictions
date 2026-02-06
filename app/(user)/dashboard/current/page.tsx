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
function teamName(t: TeamMaybeArray): string {
  if (!t) return "?";
  if (Array.isArray(t)) return t[0]?.name ?? "?";
  return t.name ?? "?";
}

type MatchRow = {
  id: string;
  kickoff_at: string | null;
  deadline_at: string | null;
  home_score: number | null;
  away_score: number | null;
  tour_id: string | null;
  tour: { name: string } | { name: string }[] | null;
  home_team: TeamMaybeArray;
  away_team: TeamMaybeArray;
};

type UserRow = { login: string; user_id: string };

function signOutcome(h: number, a: number): -1 | 0 | 1 {
  if (h === a) return 0;
  return h > a ? 1 : -1;
}

function multByCount(cnt: number): number {
  if (cnt === 1) return 1.75;
  if (cnt === 2) return 1.5;
  if (cnt === 3) return 1.25;
  return 1.0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatPts(n: number | null): string {
  if (n == null) return "";
  // красиво: 3 вместо 3.00, 2.5 вместо 2.50
  const s = (Math.round(n * 100) / 100).toString();
  return s;
}

type Pred = { h: number | null; a: number | null };

function calcPtsForUser(params: {
  pred: Pred;
  resH: number | null;
  resA: number | null;
  outcomeMult: number;
  diffMult: number;
}): number | null {
  const { pred, resH, resA, outcomeMult, diffMult } = params;
  if (pred.h == null || pred.a == null) return null;
  if (resH == null || resA == null) return null;

  const pH = pred.h;
  const pA = pred.a;

  let pts = 0;

  // 0.5 за угаданные голы каждой команды
  if (pH === resH) pts += 0.5;
  if (pA === resA) pts += 0.5;

  // исход
  const okOutcome = signOutcome(pH, pA) === signOutcome(resH, resA);
  if (okOutcome) pts += 2 * outcomeMult;

  // разница
  const okDiff = (pH - pA) === (resH - resA);
  if (okDiff) pts += 1 * diffMult;

  // бонус если “промах на 1 мяч” (в сумме по двум командам)
  const dist = Math.abs(pH - resH) + Math.abs(pA - resA);
  if (dist === 1) pts += 0.5;

  return round2(pts);
}

function tourName(t: MatchRow["tour"]): string {
  if (!t) return "";
  if (Array.isArray(t)) return t[0]?.name ?? "";
  return t.name ?? "";
}

export default async function DashboardCurrentTablePage() {
  // ✅ авторизация через fp_login
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  // текущий этап
  const { data: stage, error: stageErr } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (stageErr) {
    return (
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
        Ошибка stages: {stageErr.message}
      </main>
    );
  }

  if (!stage) {
    return (
      <main className="userMain hasBottomBar">
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Текущая таблица</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>Текущий этап не выбран.</p>
        <div style={{ marginTop: 14 }}>
          <Link href="/dashboard" style={{ textDecoration: "underline" }}>
            Назад
          </Link>
        </div>
      </main>
    );
  }

  // пользователи (без ADMIN)
  const { data: usersRaw, error: usersErr } = await sb
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login", { ascending: true });

  if (usersErr) {
    return (
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
        Ошибка login_accounts: {usersErr.message}
      </main>
    );
  }

  const users = (usersRaw ?? []) as UserRow[];
  const userIds = users.map((u) => u.user_id);

  // матчи этапа + команды + тур
  const { data: matchesRaw, error: matchesErr } = await sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      home_score,
      away_score,
      tour_id,
      tour:tours ( name ),
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stage.id)
    .order("kickoff_at", { ascending: true });

  if (matchesErr) {
    return (
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
        Ошибка matches: {matchesErr.message}
      </main>
    );
  }

  const matches = (matchesRaw ?? []) as unknown as MatchRow[];
  const matchIds = matches.map((m) => m.id);

  // прогнозы всех по матчам
  const { data: predsRaw, error: predsErr } = await sb
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  if (predsErr) {
    return (
      <main className="userMain hasBottomBar" style={{ color: "crimson" }}>
        Ошибка predictions: {predsErr.message}
      </main>
    );
  }

  // matchId -> userId -> pred
  const predByMatchUser = new Map<string, Map<string, Pred>>();
  for (const p of predsRaw ?? []) {
    if (!predByMatchUser.has(p.match_id)) predByMatchUser.set(p.match_id, new Map());
    predByMatchUser.get(p.match_id)!.set(p.user_id, {
      h: p.home_pred == null ? null : Number(p.home_pred),
      a: p.away_pred == null ? null : Number(p.away_pred),
    });
  }

  // Для каждого матча посчитать:
  // - сколько участников угадали исход (среди тех, кто сделал прогноз)
  // - сколько участников угадали разницу
  const outcomeCountByMatch = new Map<string, number>();
  const diffCountByMatch = new Map<string, number>();

  for (const m of matches) {
    const resH = m.home_score;
    const resA = m.away_score;

    // если результата нет — множители всё равно не нужны
    if (resH == null || resA == null) {
      outcomeCountByMatch.set(m.id, 0);
      diffCountByMatch.set(m.id, 0);
      continue;
    }

    let cntOutcome = 0;
    let cntDiff = 0;

    for (const u of users) {
      const pr = predByMatchUser.get(m.id)?.get(u.user_id);
      if (!pr || pr.h == null || pr.a == null) continue;

      const okOutcome = signOutcome(pr.h, pr.a) === signOutcome(resH, resA);
      if (okOutcome) cntOutcome++;

      const okDiff = (pr.h - pr.a) === (resH - resA);
      if (okDiff) cntDiff++;
    }

    outcomeCountByMatch.set(m.id, cntOutcome);
    diffCountByMatch.set(m.id, cntDiff);
  }

  // totals: userId -> total points
  const totalByUser = new Map<string, number>();
  for (const u of users) totalByUser.set(u.user_id, 0);

  for (const m of matches) {
    const resH = m.home_score;
    const resA = m.away_score;

    const outcomeMult = multByCount(outcomeCountByMatch.get(m.id) ?? 0);
    const diffMult = multByCount(diffCountByMatch.get(m.id) ?? 0);

    for (const u of users) {
      const pr = predByMatchUser.get(m.id)?.get(u.user_id) ?? { h: null, a: null };

      const pts = calcPtsForUser({
        pred: pr,
        resH,
        resA,
        outcomeMult,
        diffMult,
      });

      if (pts == null) continue;
      totalByUser.set(u.user_id, round2((totalByUser.get(u.user_id) ?? 0) + pts));
    }
  }

  const stageTitle = stage.name ?? `#${stage.id}`;

  return (
    <main className="userMain hasBottomBar">
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Текущая таблица</h1>

        <div style={{ marginTop: 6, opacity: 0.8 }}>
          Этап: <b>{stageTitle}</b>
          {stage.status ? <span style={{ opacity: 0.65 }}> • {stage.status}</span> : null}
        </div>

        <nav className="topNav" style={{ marginTop: 12 }}>
          <Link href="/dashboard">Мои прогнозы</Link>
          <Link href="/dashboard/current">Текущая таблица</Link>
          <Link href="/golden-boot">Золотая бутса</Link>
          <a href="/logout">Выйти</a>
        </nav>
      </header>

      {/* Итоги */}
      <div style={{ marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 10 }}>
        {users.map((u) => {
          const me = u.login === fpLogin;
          return (
            <div
              key={u.user_id}
              style={{
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 12,
                padding: "8px 10px",
                fontWeight: 900,
                background: me ? "rgba(0,0,0,0.04)" : "#fff",
              }}
            >
              {u.login}: {formatPts(totalByUser.get(u.user_id) ?? 0)}
            </div>
          );
        })}
      </div>

      <div className="tableWrap" style={{ overflowX: "auto" }}>
        <table className="table" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th style={{ width: 140 }}>Дата</th>
              <th style={{ minWidth: 240 }}>Матч</th>
              <th style={{ width: 110, textAlign: "center" }}>Рез.</th>

              {users.map((u) => (
                <th
                  key={u.user_id}
                  style={{
                    width: 140,
                    textAlign: "center",
                    background: u.login === fpLogin ? "rgba(0,0,0,0.04)" : "transparent",
                  }}
                >
                  {u.login}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {matches.map((m) => {
              const date = m.kickoff_at
                ? new Date(m.kickoff_at).toLocaleDateString("ru-RU", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : "—";

              const resText =
                m.home_score == null || m.away_score == null ? "—" : `${m.home_score}:${m.away_score}`;

              const tName = tourName(m);

              const outcomeMult = multByCount(outcomeCountByMatch.get(m.id) ?? 0);
              const diffMult = multByCount(diffCountByMatch.get(m.id) ?? 0);

              return (
                <tr key={m.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{date}</td>

                  <td>
                    <div style={{ fontWeight: 900 }}>
                      {teamName(m.home_team)} — {teamName(m.away_team)}
                    </div>
                    {tName ? <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{tName}</div> : null}

                    {/* подсказка по мультипликаторам */}
                    {m.home_score != null && m.away_score != null ? (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                        множители: исход ×{formatPts(outcomeMult)} • разница ×{formatPts(diffMult)}
                      </div>
                    ) : null}
                  </td>

                  <td style={{ textAlign: "center", fontWeight: 900 }}>{resText}</td>

                  {users.map((u) => {
                    const pr = predByMatchUser.get(m.id)?.get(u.user_id) ?? { h: null, a: null };
                    const predText = pr.h == null || pr.a == null ? "—" : `${pr.h}:${pr.a}`;

                    const pts = calcPtsForUser({
                      pred: pr,
                      resH: m.home_score,
                      resA: m.away_score,
                      outcomeMult,
                      diffMult,
                    });

                    const me = u.login === fpLogin;

                    return (
                      <td
                        key={u.user_id}
                        style={{
                          textAlign: "center",
                          background: me ? "rgba(0,0,0,0.04)" : "transparent",
                          fontWeight: me ? 900 : 700,
                        }}
                      >
                        <div style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                          <span style={{ fontFamily: "monospace" }}>{predText}</span>
                          {pts == null ? null : (
                            <span style={{ opacity: 0.75, fontSize: 12 }}>({formatPts(pts)})</span>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, fontSize: 12, opacity: 0.7 }}>
        На телефоне таблица прокручивается по горизонтали.
      </div>
    </main>
  );
}

function tourName(m: MatchRow): string {
  const t = m.tour;
  if (!t) return "";
  if (Array.isArray(t)) return t[0]?.name ?? "";
  return t.name ?? "";
}
