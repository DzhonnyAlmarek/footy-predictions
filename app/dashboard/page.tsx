import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MyPredictionCell from "./pred-cell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Tour = { id: number; tour_no: number; name: string | null };
type MatchRow = {
  id: number;
  tour_id: number;
  stage_match_no: number | null;
  kickoff_at: string;
  deadline_at: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
};

function stageStatusRu(s: string) {
  if (s === "draft") return "Черновик";
  if (s === "published") return "Опубликован";
  if (s === "locked") return "Закрыт";
  return s;
}

async function fetchLoginsWithRetry(supabase: any, retries = 1) {
  let lastErr: any = null;
  for (let i = 0; i <= retries; i++) {
    const res = await supabase
      .from("login_accounts")
      .select("login,user_id")
      .neq("login", "ADMIN")
      .order("login", { ascending: true });

    if (!res.error) return res;
    lastErr = res.error;
  }
  return { data: null, error: lastErr };
}

export default async function DashboardPage() {
  const supabase = await createClient();

  // user
  const { data: u, error: uErr } = await supabase.auth.getUser();
  const user = u.user;

  if (uErr || !user) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <p>
          Вы не авторизованы. Перейдите на <Link href="/">вход</Link>.
        </p>
      </main>
    );
  }

  // stage (current)
  const { data: stage, error: stageErr } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (stageErr) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>Ошибка этапа: {stageErr.message}</p>
      </main>
    );
  }

  if (!stage) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12 }}>Текущий этап не выбран админом.</p>
      </main>
    );
  }

  // my login
  const myAccPromise = supabase
    .from("login_accounts")
    .select("login")
    .eq("user_id", user.id)
    .maybeSingle();

  // parallel: logins + tours + matches + my login
  const [accsRes, toursRes, matchesRes, myAccRes] = await Promise.all([
    fetchLoginsWithRetry(supabase, 1),
    supabase
      .from("tours")
      .select("id,tour_no,name")
      .eq("stage_id", stage.id)
      .order("tour_no", { ascending: true }),
    supabase
      .from("matches")
      .select(
        `
        id,
        tour_id,
        stage_match_no,
        kickoff_at,
        deadline_at,
        home_score,
        away_score,
        home_team:teams!matches_home_team_id_fkey ( name ),
        away_team:teams!matches_away_team_id_fkey ( name )
      `
      )
      .eq("stage_id", stage.id)
      .order("tour_id", { ascending: true })
      .order("kickoff_at", { ascending: true }),
    myAccPromise,
  ]);

  if (accsRes.error) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>
          Не удалось загрузить участников (login_accounts): {accsRes.error.message}
        </p>
      </main>
    );
  }

  if (toursRes.error) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>Не удалось загрузить туры: {toursRes.error.message}</p>
      </main>
    );
  }

  if (matchesRes.error) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>Не удалось загрузить матчи: {matchesRes.error.message}</p>
      </main>
    );
  }

  const myLogin = myAccRes.data?.login ?? "ME";

  const users = (accsRes.data ?? []) as any[];
  const logins: string[] = users.map((x) => x.login);

  const userIdToLogin = new Map<string, string>(users.map((x) => [x.user_id, x.login]));
  const userIds = users.map((x) => x.user_id);

  const allTours: Tour[] = (toursRes.data ?? []) as any[];

  const matchList: MatchRow[] =
    (matchesRes.data ?? []).map((m: any) => ({
      id: m.id,
      tour_id: m.tour_id,
      stage_match_no: m.stage_match_no ?? null,
      kickoff_at: m.kickoff_at,
      deadline_at: m.deadline_at,
      home: m.home_team?.name ?? "?",
      away: m.away_team?.name ?? "?",
      home_score: m.home_score ?? null,
      away_score: m.away_score ?? null,
    })) ?? [];

  const matchIds = matchList.map((m) => m.id);

  // predictions + points_ledger параллельно
  const [predsRes, pointsRes] = await Promise.all([
    matchIds.length === 0
      ? Promise.resolve({ data: [] as any[], error: null as any })
      : supabase
          .from("predictions")
          .select("match_id,user_id,home_pred,away_pred")
          .in("match_id", matchIds),
    matchIds.length === 0 || userIds.length === 0
      ? Promise.resolve({ data: [] as any[], error: null as any })
      : supabase
          .from("points_ledger")
          .select("match_id,user_id,points")
          .in("match_id", matchIds)
          .in("user_id", userIds),
  ]);

  if (predsRes.error) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>Не удалось загрузить прогнозы: {predsRes.error.message}</p>
      </main>
    );
  }

  if (pointsRes.error) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>
          Не удалось загрузить баллы (points_ledger): {pointsRes.error.message}
        </p>
      </main>
    );
  }

  // build maps
  const predMap = new Map<string, string>(); // matchId::login -> "h:a"
  for (const p of predsRes.data ?? []) {
    const login = userIdToLogin.get(p.user_id);
    if (!login) continue;
    predMap.set(`${p.match_id}::${login}`, `${p.home_pred}:${p.away_pred}`);
  }

  const pointsMap = new Map<string, number>(); // matchId::login -> points
  const totalByLogin = new Map<string, number>(); // login -> total points
  for (const r of pointsRes.data ?? []) {
    const login = userIdToLogin.get(r.user_id);
    if (!login) continue;
    const pts = Number(r.points ?? 0);
    pointsMap.set(`${r.match_id}::${login}`, pts);
    totalByLogin.set(login, (totalByLogin.get(login) ?? 0) + pts);
  }

  // group matches by tour
  const matchesByTour = new Map<number, MatchRow[]>();
  for (const m of matchList) {
    matchesByTour.set(m.tour_id, [...(matchesByTour.get(m.tour_id) ?? []), m]);
  }

  // ✅ show only tours having matches
  const tourList = allTours.filter((t) => (matchesByTour.get(t.id) ?? []).length > 0);

  const now = Date.now();
  const needCount = matchList.filter((m) => {
    const key = `${m.id}::${myLogin}`;
    const hasPred = predMap.has(key);
    const dl = new Date(m.deadline_at).getTime();
    return !hasPred && now < dl;
  }).length;

  const gridCols = `420px 110px repeat(${logins.length}, minmax(120px, 1fr))`;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>
          Этап: <b>{stage.name}</b> • статус: <b>{stageStatusRu(stage.status)}</b>
        </p>

        {matchList.length === 0 ? (
          <div style={{ marginTop: 12, border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, fontWeight: 900 }}>
            Матчи текущего этапа ещё не назначены.
          </div>
        ) : needCount === 0 ? (
          <div style={{ marginTop: 12, border: "1px solid #e5e5e5", borderRadius: 12, padding: 12, fontWeight: 900 }}>
            Все прогнозы внесены
          </div>
        ) : (
          <div style={{ marginTop: 12, border: "1px solid #ffe08a", background: "#fff7d6", borderRadius: 12, padding: 12, fontWeight: 900 }}>
            Нужно внести прогнозы: {needCount}
          </div>
        )}
      </header>

      <section style={{ marginTop: 18 }}>
        {tourList.length === 0 ? (
          <p>В текущем этапе пока нет туров с назначенными матчами.</p>
        ) : (
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
            {/* HEADER */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: gridCols,
                padding: "10px 12px",
                background: "#f7f7f7",
                fontWeight: 900,
                borderBottom: "1px solid #eee",
                alignItems: "center",
              }}
            >
              <div>Тур / Матч (№ этапа)</div>
              <div style={{ textAlign: "center" }}>Результат</div>
              {logins.map((l) => {
                const isMe = l === myLogin;
                return (
                  <div
                    key={l}
                    style={{
                      textAlign: "center",
                      background: isMe ? "#eef6ff" : "transparent",
                      borderRadius: 8,
                      padding: "2px 0",
                    }}
                  >
                    {l}{" "}
                    <span style={{ opacity: 0.75, fontWeight: 800 }}>
                      ({totalByLogin.get(l) ?? 0})
                    </span>
                  </div>
                );
              })}
            </div>

            {/* BODY */}
            <div style={{ display: "grid", gap: 0 }}>
              {tourList.map((t) => {
                const tourMatches = matchesByTour.get(t.id) ?? [];
                return (
                  <div key={t.id} style={{ borderTop: "1px solid #eee" }}>
                    <div
                      style={{
                        padding: "10px 12px",
                        background: "#fafafa",
                        fontWeight: 900,
                        borderBottom: "1px solid #eee",
                      }}
                    >
                      Тур {t.tour_no}
                      {t.name ? ` — ${t.name}` : ""}{" "}
                      <span style={{ opacity: 0.75, fontWeight: 700 }}>(матчей: {tourMatches.length})</span>
                    </div>

                    {tourMatches.map((m) => {
                      const kickoff = new Date(m.kickoff_at).toLocaleString("ru-RU", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      });

                      const dl = new Date(m.deadline_at).getTime();
                      const result =
                        m.home_score === null || m.away_score === null ? "" : `${m.home_score}:${m.away_score}`;

                      const myKey = `${m.id}::${myLogin}`;
                      const needPred = !predMap.has(myKey) && now < dl;

                      return (
                        <div
                          key={m.id}
                          style={{
                            display: "grid",
                            gridTemplateColumns: gridCols,
                            padding: "10px 12px",
                            borderTop: "1px solid #f0f0f0",
                            alignItems: "center",
                            background: needPred ? "#fff1f1" : "#fff",
                          }}
                        >
                          <div>
                            <div style={{ fontWeight: 800 }}>
                              {m.stage_match_no ?? "—"}. {m.home} — {m.away}
                              {needPred ? (
                                <span style={{ marginLeft: 8, color: "crimson", fontWeight: 900 }}>
                                  нужно внести прогноз
                                </span>
                              ) : null}
                            </div>
                            <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12 }}>{kickoff}</div>
                          </div>

                          <div style={{ textAlign: "center", fontWeight: 900 }}>{result}</div>

                          {logins.map((login) => {
                            const key = `${m.id}::${login}`;
                            const pred = predMap.get(key) ?? "";
                            const pts = pointsMap.get(key);
                            const isMe = login === myLogin;

                            if (!isMe) {
                              return (
                                <div key={login} style={{ textAlign: "center", fontWeight: 800 }}>
                                  {pred ? (
                                    <>
                                      {pred}
                                      {typeof pts === "number" ? <span style={{ opacity: 0.85 }}> ({pts})</span> : null}
                                    </>
                                  ) : (
                                    ""
                                  )}
                                </div>
                              );
                            }

                            return (
                              <div
                                key={login}
                                style={{
                                  textAlign: "center",
                                  background: "#eef6ff",
                                  borderRadius: 10,
                                  padding: "6px 4px",
                                }}
                              >
                                <MyPredictionCell
                                  matchId={m.id}
                                  deadlineAt={m.deadline_at}
                                  initialPred={pred}
                                  initialPoints={typeof pts === "number" ? pts : null}
                                />
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
