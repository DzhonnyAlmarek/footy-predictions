"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";

type Prediction = {
  match_id: string; kickoff_at: string | null; home_team: string | null;
  away_team: string | null; home_pred: number | null; away_pred: number | null;
  home_score: number | null; away_score: number | null;
  predictions_open?: boolean;
};

export default function CutoverParticipantPage() {
  const [username, setUsername] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState<{ teams: { id: string; name: string }[]; tournaments: { id: string; name: string }[]; stages: { id: string; name: string }[]; tours: { id: string; name: string; stage_id: string }[]; matches: { id: string; status: string; kickoff_at: string; home_team: string; away_team: string }[] } | null>(null);
  const [adminForm, setAdminForm] = useState({ tournament_id: "", stage_id: "", tour_id: "", home_team_id: "", away_team_id: "", kickoff_at: "", deadline_at: "" });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [schedule, setSchedule] = useState<Prediction[]>([]);
  const [leaderboard, setLeaderboard] = useState<{ username: string; points: string; scored_predictions: number }[]>([]);
  const [message, setMessage] = useState("Проверяем сессию...");
  const [busy, setBusy] = useState(false);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [adminWritesEnabled, setAdminWritesEnabled] = useState(false);
  const [resultWritesEnabled, setResultWritesEnabled] = useState(false);
  const [resultForm, setResultForm] = useState({ match_id: "", home_score: "", away_score: "" });
  const [drafts, setDrafts] = useState<Record<string, { home: string; away: string }>>({});

  async function load() {
    const session = await fetch("/api/cutover/session", { cache: "no-store" });
    if (!session.ok) { setAuthenticated(false); setIsAdmin(false); setAdminData(null); setMessage("Войди, чтобы увидеть свои прогнозы."); return; }
    const sessionData = await session.json();
    setIsAdmin(sessionData.role === "admin");
    if (sessionData.role === "admin") {
      const adminResponse = await fetch("/api/cutover/admin", { cache: "no-store" });
      if (adminResponse.ok) {
        const adminPayload = await adminResponse.json();
        setAdminData(adminPayload);
        setAdminWritesEnabled(adminPayload.writes_enabled === true);
        setResultWritesEnabled(adminPayload.result_writes_enabled === true);
      }
    }
    const response = await fetch("/api/cutover/my-predictions", { cache: "no-store" });
    if (!response.ok) { setAuthenticated(false); setIsAdmin(false); setAdminData(null); setMessage("Не удалось получить прогнозы."); return; }
    const data = await response.json();
    setPredictions(Array.isArray(data.predictions) ? data.predictions : []);
    const scheduleResponse = await fetch("/api/cutover/schedule", { cache: "no-store" });
    if (scheduleResponse.ok) {
      const scheduleData = await scheduleResponse.json();
      setSchedule(Array.isArray(scheduleData.matches) ? scheduleData.matches : []);
      setDrafts({});
    }
    const readiness = await fetch("/api/cutover/save-prediction", { cache: "no-store" });
    setWritesEnabled(readiness.ok && (await readiness.json()).enabled === true);
    const rankingResponse = await fetch("/api/cutover/leaderboard", { cache: "no-store" });
    if (rankingResponse.ok) {
      const rankingData = await rankingResponse.json();
      setLeaderboard(Array.isArray(rankingData.leaderboard) ? rankingData.leaderboard : []);
    }
    setAuthenticated(true);
    setMessage("Данные загружены из изолированной Neon.");
  }
  useEffect(() => {
    void load().catch(() => setMessage("Сервис пока недоступен."));
    void fetch("/api/cutover/participants", { cache: "no-store" })
      .then(response => response.ok ? response.json() : { participants: [] })
      .then(data => setParticipants(Array.isArray(data.participants) ? data.participants : []))
      .catch(() => setParticipants([]));
  }, []);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      setPassword("");
      if (!response.ok) { setMessage(response.status === 429 ? "Слишком много попыток входа. Подожди 15 минут, не повторяя попытки." : response.status === 401 ? "Неверный логин или пароль." : "Вход временно недоступен. Попробуй позже."); return; }
      await load();
    } catch { setMessage("Не удалось подключиться."); }
    finally { setBusy(false); }
  }
  async function savePrediction(m: Prediction) {
    const draft = drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") };
    if (!/^[0-9]{1,2}$/.test(draft.home) || !/^[0-9]{1,2}$/.test(draft.away)) {
      setMessage("Укажи целые значения счёта от 0 до 99."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/save-prediction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: m.match_id, home_pred: Number(draft.home), away_pred: Number(draft.away) })
      });
      if (!response.ok) { setMessage("Прогноз не сохранён. Проверь дедлайн или попробуй позже."); return; }
      await load();
      setMessage("Прогноз сохранён.");
    } catch { setMessage("Ошибка соединения при сохранении."); }
    finally { setBusy(false); }
  }
  async function createMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_match", ...adminForm,
          kickoff_at: new Date(adminForm.kickoff_at).toISOString(),
          deadline_at: new Date(adminForm.deadline_at).toISOString() }) });
      if (!response.ok) { setMessage("Матч не создан. Проверь данные и разрешение на запись."); return; }
      await load(); setMessage("Матч создан.");
    } catch { setMessage("Не удалось создать матч."); }
    finally { setBusy(false); }
  }
  async function finishMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^[0-9]{1,2}$/.test(resultForm.home_score) || !/^[0-9]{1,2}$/.test(resultForm.away_score)) {
      setMessage("Укажи счёт от 0 до 99."); return;
    }
    if (!window.confirm("Завершить матч и начислить очки? Изменить результат через эту форму нельзя.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "result", match_id: resultForm.match_id,
          home_score: Number(resultForm.home_score), away_score: Number(resultForm.away_score) }) });
      if (!response.ok) { setMessage("Результат не записан. Матч уже завершён, не найден или запись отключена."); return; }
      setResultForm({ match_id: "", home_score: "", away_score: "" });
      await load(); setMessage("Результат записан, очки рассчитаны.");
    } catch { setMessage("Ошибка сохранения результата."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/logout", { method: "POST" });
      if (!response.ok) { setMessage("Не удалось завершить сессию."); return; }
      setAuthenticated(false);
      setIsAdmin(false);
      setAdminData(null);
      setPredictions([]);
      setSchedule([]);
      setLeaderboard([]);
      setWritesEnabled(false);
      setAdminWritesEnabled(false);
      setResultWritesEnabled(false);
      setMessage("Ты вышел из системы.");
    } catch { setMessage("Не удалось завершить сессию."); }
    finally { setBusy(false); }
  }

  return <main className="page" style={{ maxWidth: 1120 }}>
    <header className="card" style={{ padding: 22, marginBottom: 18, background: "linear-gradient(120deg, #102d46, #174e6d)", color: "#fff" }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, opacity: .8 }}>ФУТБОЛЬНЫЙ КОНКУРС ПРОГНОЗОВ</div>
    <h1 style={{ margin: "8px 0", color: "#fff" }}>Golden Whistle</h1>
    <div style={{ fontSize: 13, opacity: .85 }}>Изолированная тестовая версия · Yandex Cloud + Neon</div>
    </header>
    <div role="status" className="card" style={{ padding: 14, marginBottom: 18 }}>{message}</div>
    {!authenticated ? <form onSubmit={login} className="card" style={{ padding: 22, display: "grid", gap: 14, maxWidth: 520, margin: "0 auto" }}>
      <label>Участник <select value={username} onChange={e => setUsername(e.target.value)} required>
        <option value="">Выбери участника</option>
        {participants.map(name => <option key={name} value={name}>{name}</option>)}
      </select></label>
      <label>Пароль <input type="password" value={password}
        onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button type="submit" disabled={busy}>Войти</button>
    </form> : <>
      <button type="button" onClick={logout} disabled={busy}>Выйти</button>
      {isAdmin && adminData && <section className="card" style={{ padding: 20, marginTop: 18 }}>
        <h2>ADMIN — создание матча</h2>
        <form onSubmit={createMatch} style={{ display: "grid", gap: 10 }}>
          {(["tournament_id", "stage_id", "tour_id", "home_team_id", "away_team_id"] as const).map(field => {
            const options = field === "tournament_id" ? adminData.tournaments :
              field === "stage_id" ? adminData.stages : field === "tour_id" ?
              adminData.tours.filter(t => t.stage_id === adminForm.stage_id) : adminData.teams;
            const label = { tournament_id: "Турнир", stage_id: "Этап", tour_id: "Тур",
              home_team_id: "Хозяева", away_team_id: "Гости" }[field];
            return <label key={field}>{label} <select required value={adminForm[field]}
              onChange={e => setAdminForm(prev => ({ ...prev, [field]: e.target.value,
                ...(field === "stage_id" ? { tour_id: "" } : {}) }))}>
              <option value="">Выбери</option>
              {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select></label>;
          })}
          <label>Начало матча <input required type="datetime-local" value={adminForm.kickoff_at}
            onChange={e => setAdminForm(prev => ({ ...prev, kickoff_at: e.target.value }))} /></label>
          <label>Дедлайн прогноза <input required type="datetime-local" value={adminForm.deadline_at}
            onChange={e => setAdminForm(prev => ({ ...prev, deadline_at: e.target.value }))} /></label>
          <button disabled={busy || !adminWritesEnabled} type="submit">Создать матч</button>
          {!adminWritesEnabled && <p>Создание матчей пока отключено на этой площадке.</p>}
        </form>
        <h2>ADMIN — результат матча</h2>
        <form onSubmit={finishMatch} style={{ display: "grid", gap: 10 }}>
          <label>Матч <select required value={resultForm.match_id}
            onChange={e => setResultForm(prev => ({ ...prev, match_id: e.target.value }))}>
            <option value="">Выбери незавершённый матч</option>
            {(adminData.matches ?? []).filter(m => m.status === "scheduled").map(m =>
              <option key={m.id} value={m.id}>{m.home_team} — {m.away_team} ({new Date(m.kickoff_at).toLocaleString("ru-RU")})</option>)}
          </select></label>
          <label>Голы хозяев <input required type="number" min="0" max="99"
            value={resultForm.home_score} onChange={e => setResultForm(prev => ({ ...prev, home_score: e.target.value }))} /></label>
          <label>Голы гостей <input required type="number" min="0" max="99"
            value={resultForm.away_score} onChange={e => setResultForm(prev => ({ ...prev, away_score: e.target.value }))} /></label>
          <button type="submit" disabled={busy || !adminWritesEnabled || !resultWritesEnabled || !resultForm.match_id}>Записать результат и начислить очки</button>
          {!resultWritesEnabled && <p>Запись результатов отключена на этой площадке.</p>}
        </form>
      </section>}
      <h2 style={{ marginTop: 28 }}>Общий рейтинг</h2>
      <div className="tableWrap"><table className="table" style={{ minWidth: 500 }}>
        <thead><tr><th>Участник</th><th>Очки</th><th>Учтённых прогнозов</th></tr></thead>
        <tbody>{leaderboard.map(p => <tr key={p.username}>
          <td>{p.username}</td><td>{p.points}</td><td>{p.scored_predictions}</td>
        </tr>)}</tbody>
      </table></div>
      <h2>Расписание матчей ({schedule.length})</h2>
      <p>{writesEnabled ? "Прогнозы можно менять до дедлайна." : "Сохранение новых прогнозов пока отключено."}</p>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Дата</th><th>Матч</th><th>Прогноз</th><th>Результат</th>{writesEnabled && <th>Изменить прогноз</th>}</tr></thead>
        <tbody>{schedule.map(m => <tr key={m.match_id}>
          <td>{m.kickoff_at ? new Date(m.kickoff_at).toLocaleString("ru-RU") : "—"}</td>
          <td>{m.home_team || "?"} — {m.away_team || "?"}</td>
          <td>{m.home_pred ?? "—"} : {m.away_pred ?? "—"}</td>
          <td>{m.home_score ?? "—"} : {m.away_score ?? "—"}</td>
          {writesEnabled && <td>{m.predictions_open ? <div>
            <input aria-label="Голы хозяев" type="number" min="0" max="99" style={{ width: 52 }}
              value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).home}
              onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: e.target.value, away: (prev[m.match_id]?.away ?? String(m.away_pred ?? "")) } }))} />
            :
            <input aria-label="Голы гостей" type="number" min="0" max="99" style={{ width: 52 }}
              value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).away}
              onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: (prev[m.match_id]?.home ?? String(m.home_pred ?? "")), away: e.target.value } }))} />
            <button type="button" disabled={busy} onClick={() => void savePrediction(m)}>Сохранить</button>
          </div> : "Закрыто"}</td>}
        </tr>)}</tbody>
      </table></div>
      <h2>Мои прогнозы ({predictions.length})</h2>
      <div className="tableWrap"><table className="table" style={{ minWidth: 500 }}>
        <thead><tr><th>Матч</th><th>Прогноз</th><th>Результат</th></tr></thead>
        <tbody>{predictions.map(p => <tr key={p.match_id}>
          <td>{p.home_team || "?"} — {p.away_team || "?"}</td>
          <td>{p.home_pred ?? "—"} : {p.away_pred ?? "—"}</td>
          <td>{p.home_score ?? "—"} : {p.away_score ?? "—"}</td>
        </tr>)}</tbody>
      </table></div>
    </>}
  </main>;
}
