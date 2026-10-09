"use client";

import { useEffect, useState } from "react";

type Stage = { id: number; name: string; status: string | null; is_current: boolean | null };
type Tour = { id: number; stage_id: number; tour_no: string | null; name: string | null };
type Match = {
  id: number; stage_id: number | null; tour_id: number | null;
  kickoff_at: string | null; deadline_at: string | null; status: string | null;
  home_team: string | null; away_team: string | null;
  home_score: number | null; away_score: number | null;
};
type Schedule = { ok: boolean; stages: Stage[]; tours: Tour[]; matches: Match[] };

function dateMsk(value: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) + " МСК" : "не назначено";
}

export default function TestSchedulePage() {
  const [data, setData] = useState<Schedule | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/test/schedule", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error("Недоступно тестовое расписание");
        return r.json();
      })
      .then((result: Schedule) => {
        if (!active) return;
        if (!result.ok || !Array.isArray(result.stages) || !Array.isArray(result.tours) || !Array.isArray(result.matches))
          throw new Error("Некорректный ответ сервера");
        setData(result);
      })
      .catch(() => { if (active) setError("Не удалось загрузить тестовое расписание из Neon"); });
    return () => { active = false; };
  }, []);

  return (
    <main style={{ maxWidth: 850, margin: "40px auto", padding: 24, fontFamily: "sans-serif" }}>
      <h1>Тестовое расписание — Neon</h1>
      <p>Только искусственные данные. Работающий конкурс, прогнозы и Supabase не используются.</p>
      <p><a href="/test-area">В тестовый кабинет</a></p>
      {!data && !error && <p role="status">Загружаем расписание…</p>}
      {error && <p role="alert">{error}</p>}
      {data && !data.stages.length && <p>Тестовых этапов пока нет.</p>}
      {data?.stages.map((stage) => (
        <section key={stage.id} style={{ marginTop: 24 }}>
          <h2>{stage.name}{stage.is_current ? " · текущий" : ""}</h2>
          <p>Статус: {stage.status || "не указан"}</p>
          {data.tours.filter((tour) => String(tour.stage_id) === String(stage.id)).map((tour) => (
            <section key={tour.id} style={{ border: "1px solid #ccc", borderRadius: 8, padding: 16, marginBottom: 12 }}>
              <h3>{tour.name || `Тур ${tour.tour_no || tour.id}`}</h3>
              {data.matches.filter((match) => String(match.tour_id) === String(tour.id)).length === 0
                ? <p>Матчей в этом туре пока нет.</p>
                : <ul>{data.matches.filter((match) => String(match.tour_id) === String(tour.id)).map((match) => (
                    <li key={match.id} style={{ marginBottom: 12 }}>
                      <strong>{match.home_team || "Хозяева"} — {match.away_team || "Гости"}</strong>
                      {" · "}{match.home_score == null || match.away_score == null ? "результат не внесён" : `${match.home_score}:${match.away_score}`}
                      <div>Начало: {dateMsk(match.kickoff_at)}; прогноз до: {dateMsk(match.deadline_at)}</div>
                    </li>
                  ))}</ul>}
            </section>
          ))}
        </section>
      ))}
    </main>
  );
}
