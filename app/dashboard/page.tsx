import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) redirect("/login");

  // 1) Сумма очков
  const { data: pointsRows, error: pointsErr } = await supabase
    .from("points_ledger")
    .select("points");

  const totalPoints = (pointsRows ?? []).reduce((s: number, r: any) => s + (r.points ?? 0), 0);

  // 2) Мои прогнозы
  const { data: preds, error } = await supabase
    .from("predictions")
    .select(
      `
      id,
      match_id,
      home_pred,
      away_pred,
      updated_at,
      matches (
        kickoff_at,
        deadline_at,
        status,
        home_score,
        away_score,
        tournaments ( name, slug ),
        home_team:teams!matches_home_team_id_fkey ( name, slug ),
        away_team:teams!matches_away_team_id_fkey ( name, slug )
      )
    `
    )
    .order("updated_at", { ascending: false })
    .limit(50);

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Мои прогнозы</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>{userData.user.email}</p>
        </div>
        <nav style={{ display: "flex", gap: 12 }}>
          <Link href="/">Матчи</Link>
          <Link href="/leaderboard">Лидерборд</Link>
          <a href="/logout">Выйти</a>
        </nav>
      </header>

      <section style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, minWidth: 220 }}>
          <div style={{ opacity: 0.8 }}>Мои очки</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{totalPoints}</div>
          {pointsErr && (
            <div style={{ marginTop: 8, color: "crimson", fontSize: 13 }}>
              Ошибка очков: {pointsErr.message}
            </div>
          )}
        </div>

        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, minWidth: 220 }}>
          <div style={{ opacity: 0.8 }}>Прогнозов</div>
          <div style={{ fontSize: 28, fontWeight: 900, marginTop: 6 }}>{preds?.length ?? 0}</div>
        </div>
      </section>

      {error && (
        <p style={{ marginTop: 16, color: "crimson" }}>
          Ошибка загрузки прогнозов: {error.message}
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        {!preds || preds.length === 0 ? (
          <p>
            Пока нет прогнозов. Перейдите на <Link href="/">главную</Link> и сделайте прогноз.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {preds.map((p: any) => {
              const m = p.matches;
              const kickoff = m?.kickoff_at ? new Date(m.kickoff_at) : null;
              const deadline = m?.deadline_at ? new Date(m.deadline_at) : null;
              const finalScore =
                m?.home_score === null || m?.away_score === null ? null : `${m.home_score}:${m.away_score}`;

              return (
                <Link
                  key={p.id}
                  href={`/match/${p.match_id}`}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 14,
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 700 }}>
                        {m?.home_team?.name ?? "?"} — {m?.away_team?.name ?? "?"}
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.8 }}>
                        {m?.tournaments?.name ?? "Без турнира"} • статус: {m?.status ?? "?"}
                        {finalScore ? ` • итог: ${finalScore}` : ""}
                      </div>
                      {kickoff && (
                        <div style={{ marginTop: 6, opacity: 0.8 }}>
                          Kickoff:{" "}
                          {kickoff.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                      )}
                      {deadline && (
                        <div style={{ marginTop: 4, opacity: 0.8 }}>
                          Дедлайн:{" "}
                          {deadline.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
                        </div>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 22, fontWeight: 800 }}>
                        {p.home_pred} : {p.away_pred}
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
                        обновлено:{" "}
                        {new Date(p.updated_at).toLocaleString("ru-RU", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
