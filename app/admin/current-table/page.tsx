import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

type Tour = { id: number; tour_no: number; name: string | null };
type MatchRow = {
  id: number;
  tour_id: number;
  stage_match_no: number | null;
  kickoff_at: string;
  home: string;
  away: string;
  home_score: number | null;
  away_score: number | null;
};

export default async function AdminCurrentTablePage() {
  const supabase = await createClient();

  const { data: stage, error: stageErr } = await supabase
    .from("stages")
    .select("id,name,status,created_at")
    .eq("is_current", true)
    .maybeSingle();

  if (stageErr) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12, color: "crimson" }}>Ошибка: {stageErr.message}</p>
      </main>
    );
  }

  if (!stage) {
    return (
      <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 12 }}>Текущий этап не выбран.</p>
        <p style={{ marginTop: 12 }}>
          Перейдите в <Link href="/admin/stages">Этапы</Link> и нажмите <b>«Сделать текущим»</b>.
        </p>
      </main>
    );
  }

  const { data: users, error: usersErr } = await supabase
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login", { ascending: true });

  const userIdToLogin = new Map<string, string>(
    (users ?? []).map((u: any) => [u.user_id, u.login])
  );
  const logins: string[] = (users ?? []).map((u: any) => u.login);

  const { data: tours, error: toursErr } = await supabase
    .from("tours")
    .select("id,tour_no,name")
    .eq("stage_id", stage.id)
    .order("tour_no", { ascending: true });

  const tourList: Tour[] = (tours ?? []) as any;

  const { data: matches, error: matchesErr } = await supabase
    .from("matches")
    .select(
      `
      id,
      tour_id,
      stage_match_no,
      kickoff_at,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", stage.id)
    .order("tour_id", { ascending: true })
    .order("kickoff_at", { ascending: true });

  const matchList: MatchRow[] =
    (matches ?? []).map((m: any) => ({
      id: m.id,
      tour_id: m.tour_id,
      stage_match_no: m.stage_match_no ?? null,
      kickoff_at: m.kickoff_at,
      home: m.home_team?.name ?? "?",
      away: m.away_team?.name ?? "?",
      home_score: m.home_score ?? null,
      away_score: m.away_score ?? null,
    })) ?? [];

  const matchIds = matchList.map((m) => m.id);

  // predictions
  const predMap = new Map<string, string>(); // matchId::login -> "h:a"
  if (matchIds.length > 0) {
    const { data: preds } = await supabase
      .from("predictions")
      .select("match_id,user_id,home_pred,away_pred")
      .in("match_id", matchIds);

    for (const p of preds ?? []) {
      const login = userIdToLogin.get(p.user_id);
      if (!login) continue;
      predMap.set(`${p.match_id}::${login}`, `${p.home_pred}:${p.away_pred}`);
    }
  }

  // points + totals
  const pointsMap = new Map<string, number>(); // matchId::login -> points
  const totalByLogin = new Map<string, number>(); // login -> sum in stage

  if (matchIds.length > 0 && (users ?? []).length > 0) {
    const userIds = (users ?? []).map((u: any) => u.user_id);

    const { data: rows } = await supabase
      .from("points_ledger")
      .select("match_id,user_id,points")
      .in("match_id", matchIds)
      .in("user_id", userIds);

    for (const r of rows ?? []) {
      const login = userIdToLogin.get(r.user_id);
      if (!login) continue;
      const pts = Number(r.points ?? 0);
      pointsMap.set(`${r.match_id}::${login}`, pts);
      totalByLogin.set(login, (totalByLogin.get(login) ?? 0) + pts);
    }
  }

  const matchesByTour = new Map<number, MatchRow[]>();
  for (const m of matchList) {
    matchesByTour.set(m.tour_id, [...(matchesByTour.get(m.tour_id) ?? []), m]);
  }

  const hasErrors = usersErr || toursErr || matchesErr;
  const gridCols = `420px 110px repeat(${logins.length}, minmax(110px, 1fr))`;

  return (
    <main style={{ maxWidth: 1200, margin: "0 auto", padding: 24 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Текущая таблица</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Этап: <b>{stage.name}</b> • статус: <b>{stage.status}</b>
        </p>
      </header>

      {hasErrors && (
        <p style={{ marginTop: 16, color: "crimson" }}>
          Ошибка загрузки: {usersErr?.message ?? toursErr?.message ?? matchesErr?.message}
        </p>
      )}

      <section style={{ marginTop: 18 }}>
        {logins.length === 0 ? (
          <p>Нет участников (login_accounts пуст).</p>
        ) : tourList.length === 0 ? (
          <p>В этапе нет туров.</p>
        ) : (
          <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
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
              {logins.map((l) => (
                <div key={l} style={{ textAlign: "center" }}>
                  {l}{" "}
                  <span style={{ opacity: 0.75, fontWeight: 800 }}>
                    ({totalByLogin.get(l) ?? 0})
                  </span>
                </div>
              ))}
            </div>

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
                      <span style={{ opacity: 0.75, fontWeight: 700 }}>
                        (матчей: {tourMatches.length})
                      </span>
                    </div>

                    {tourMatches.length === 0 ? (
                      <div style={{ padding: "10px 12px", opacity: 0.8 }}>Матчей нет</div>
                    ) : (
                      tourMatches.map((m) => {
                        const kickoff = new Date(m.kickoff_at).toLocaleString("ru-RU", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        });
                        const result =
                          m.home_score === null || m.away_score === null
                            ? ""
                            : `${m.home_score}:${m.away_score}`;

                        return (
                          <div
                            key={m.id}
                            style={{
                              display: "grid",
                              gridTemplateColumns: gridCols,
                              padding: "10px 12px",
                              borderTop: "1px solid #f0f0f0",
                              alignItems: "center",
                            }}
                          >
                            <div>
                              <div style={{ fontWeight: 800 }}>
                                {m.stage_match_no ?? "—"}. {m.home} — {m.away}
                              </div>
                              <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12 }}>
                                {kickoff} •{" "}
                                <Link href={`/match/${m.id}`} style={{ textDecoration: "underline" }}>
                                  открыть
                                </Link>
                              </div>
                            </div>

                            <div style={{ textAlign: "center", fontWeight: 900 }}>{result}</div>

                            {logins.map((login) => {
                              const pred = predMap.get(`${m.id}::${login}`) ?? "";
                              if (!pred) return <div key={login} style={{ textAlign: "center" }} />;

                              const pts = pointsMap.get(`${m.id}::${login}`);
                              return (
                                <div key={login} style={{ textAlign: "center", fontWeight: 800 }}>
                                  {pred}
                                  {typeof pts === "number" ? (
                                    <span style={{ opacity: 0.85 }}> ({pts})</span>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })
                    )}
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
