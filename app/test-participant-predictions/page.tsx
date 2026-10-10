"use client";
import { useEffect, useState } from "react";

type Prediction = {
  prediction_id: string; match_id: string; home_pred: number; away_pred: number;
  updated_at: string | null; kickoff_at: string | null; status: string | null;
  home_score: number | null; away_score: number | null;
  home_team: string | null; away_team: string | null;
  stage_name: string | null; tour_name: string | null; prediction_points: number | string | null;
};
type Payload = { username: string; predictions: Prediction[] };

export default function ParticipantPredictionsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/test/participant-predictions", { cache: "no-store", credentials: "same-origin", signal: controller.signal })
      .then(async r => {
        if (r.status === 401) throw new Error("Сессия отсутствует или истекла. Войди в кабинет участника заново.");
        if (!r.ok) throw new Error("Не удалось получить прогнозы из тестовой Neon.");
        return r.json();
      })
      .then((payload: Payload) => setData(payload))
      .catch(e => { if (!controller.signal.aborted) setError(e.message || "Ошибка загрузки"); });
    return () => controller.abort();
  }, []);

  async function logout() {
    try {
      const res = await fetch("/api/test/participant-logout", { method: "POST", credentials: "same-origin" });
      if (!res.ok) { setError("Не удалось завершить сессию. Попробуй ещё раз."); return; }
      window.location.replace("/test-participant-login");
    } catch { setError("Не удалось завершить сессию."); }
  }

  return <main style={{ maxWidth: 900, margin: "40px auto", padding: 20 }}>
    <h1>Мои прогнозы — тест Neon</h1>
    <button type="button" onClick={logout} style={{ marginBottom: 12 }}>Выйти</button>
    <p>Только просмотр. Изменения прогнозов и начисление очков отключены. Данные из изолированной миграционной схемы Neon.</p>
    {!data && !error && <p role="status">Загружаем прогнозы…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p>Участник: <strong>{data.username}</strong>. Прогнозов: {data.predictions.length}{data.predictions.length === 500 ? " (показаны последние 500)" : ""}.</p>
      {data.predictions.length === 0 ? <p>Прогнозы для этого участника не найдены.</p> :
        <div style={{ overflowX: "auto" }}><table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
          <thead><tr><th>Матч</th><th>Дата</th><th>Прогноз</th><th>Результат</th><th>Баллы за прогноз</th></tr></thead>
          <tbody>{data.predictions.map(p => <tr key={p.prediction_id}>
            <td style={{ padding: 8, borderBottom: "1px solid #aaa" }}>{p.home_team ?? "Команда"} — {p.away_team ?? "Команда"}<div style={{ fontSize: 12 }}>{[p.stage_name, p.tour_name].filter(Boolean).join(" / ")}</div></td>
            <td style={{ padding: 8, borderBottom: "1px solid #aaa" }}>{p.kickoff_at ? new Date(p.kickoff_at).toLocaleString("ru-RU") : "—"}</td>
            <td style={{ padding: 8, borderBottom: "1px solid #aaa" }}>{p.home_pred}:{p.away_pred}</td>
            <td style={{ padding: 8, borderBottom: "1px solid #aaa" }}>{p.home_score != null && p.away_score != null ? `${p.home_score}:${p.away_score}` : "—"}</td>
            <td style={{ padding: 8, borderBottom: "1px solid #aaa" }}>{p.prediction_points ?? "—"}</td>
          </tr>)}</tbody>
        </table></div>}
    </>}
  </main>;
}
