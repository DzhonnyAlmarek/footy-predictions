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
  const [activeTab, setActiveTab] = useState<"schedule" | "ranking" | "grand-prix" | "mine" | "admin">("schedule");
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [matchFilter, setMatchFilter] = useState<"upcoming" | "all">("upcoming");
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionUsername, setSessionUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState<{ teams: { id: string; name: string }[]; tournaments: { id: string; name: string }[]; stages: { id: string; name: string }[]; tours: { id: string; name: string; stage_id: string }[]; matches: { id: string; status: string; kickoff_at: string; home_team: string; away_team: string; admin_created: boolean }[] } | null>(null);
  const [tourForm, setTourForm] = useState({ stage_id: "", tour_no: "", name: "" });
  const [renameTourForm, setRenameTourForm] = useState({ tour_id: "", name: "" });
  const [adminForm, setAdminForm] = useState({ tournament_id: "", stage_id: "", tour_id: "", home_team_id: "", away_team_id: "", kickoff_at: "", deadline_at: "" });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [schedule, setSchedule] = useState<Prediction[]>([]);
  const [grandPrix, setGrandPrix] = useState<{ seasons: { id: string; name: string }[]; ratings: { season_id: string; username: string; points: string; scored_rounds: number }[] } | null>(null);
  const [grandPrixUnavailable, setGrandPrixUnavailable] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ username: string; points: string; scored_predictions: number }[]>([]);
  const [message, setMessage] = useState("Проверяем сессию...");
  const [busy, setBusy] = useState(false);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [adminWritesEnabled, setAdminWritesEnabled] = useState(false);
  const [resultWritesEnabled, setResultWritesEnabled] = useState(false);
  const [resultForm, setResultForm] = useState({ match_id: "", home_score: "", away_score: "" });
  const [rescheduleForm, setRescheduleForm] = useState({ match_id: "", kickoff_at: "", deadline_at: "" });
  const [drafts, setDrafts] = useState<Record<string, { home: string; away: string }>>({});

  async function load() {
    const session = await fetch("/api/cutover/session", { cache: "no-store" });
    if (!session.ok) { setSessionUsername(""); setAuthenticated(false); setIsAdmin(false); setAdminData(null); setMessage("Войди, чтобы увидеть свои прогнозы."); return; }
    const sessionData = await session.json();
    setSessionUsername(typeof sessionData.username === "string" ? sessionData.username : "");
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
    if (!response.ok) { setSessionUsername(""); setAuthenticated(false); setIsAdmin(false); setAdminData(null); setMessage("Не удалось получить прогнозы."); return; }
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
    const grandPrixResponse = await fetch("/api/cutover/grand-prix", { cache: "no-store" }).catch(() => null);
    if (grandPrixResponse?.ok) {
      const grandPrixData = await grandPrixResponse.json();
      setGrandPrix({ seasons: Array.isArray(grandPrixData.seasons) ? grandPrixData.seasons : [], ratings: Array.isArray(grandPrixData.ratings) ? grandPrixData.ratings : [] });
      setGrandPrixUnavailable(false);
    } else { setGrandPrix(null); setGrandPrixUnavailable(true); }
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
    setSavedMatchId(null);
    try {
      const response = await fetch("/api/cutover/save-prediction", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: m.match_id, home_pred: Number(draft.home), away_pred: Number(draft.away) })
      });
      if (!response.ok) { setMessage("Прогноз не сохранён. Проверь дедлайн или попробуй позже."); return; }
      await load();
      setSavedMatchId(m.match_id);
      setMessage(`Прогноз на матч ${m.home_team || "?"} — ${m.away_team || "?"} сохранён.`);
    } catch { setMessage("Ошибка соединения при сохранении."); }
    finally { setBusy(false); }
  }
  async function createTour(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_tour", ...tourForm })
      });
      if (!response.ok) {
        setMessage(response.status === 409
          ? "Тур уже существует или этап не найден."
          : "Не удалось создать тур."); return;
      }
      setTourForm(prev => ({ ...prev, tour_no: "", name: "" }));
      await load();
      setMessage("Новый тур создан.");
    } catch { setMessage("Ошибка соединения при создании тура."); }
    finally { setBusy(false); }
  }
  async function renameTour(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameTourForm.tour_id || !renameTourForm.name.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename_tour", ...renameTourForm })
      });
      if (!response.ok) { setMessage("Не удалось переименовать тур."); return; }
      setRenameTourForm({ tour_id: "", name: "" });
      await load();
      setMessage("Название тура изменено.");
    } catch { setMessage("Ошибка соединения при переименовании тура."); }
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
  async function rescheduleMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduleForm.match_id || !rescheduleForm.kickoff_at || !rescheduleForm.deadline_at) return;
    const kickoff = new Date(rescheduleForm.kickoff_at);
    const deadline = new Date(rescheduleForm.deadline_at);
    if (!Number.isFinite(kickoff.getTime()) || !Number.isFinite(deadline.getTime()) ||
        deadline.getTime() <= Date.now() || deadline.getTime() > kickoff.getTime()) {
      setMessage("Проверь даты: дедлайн должен быть в будущем и не позже начала матча."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule_match", match_id: rescheduleForm.match_id,
          kickoff_at: kickoff.toISOString(), deadline_at: deadline.toISOString() })
      });
      if (!response.ok) { setMessage("Перенос отклонён: матч уже закрыт, импортирован или на него есть прогнозы."); return; }
      setRescheduleForm({ match_id: "", kickoff_at: "", deadline_at: "" });
      await load();
      setMessage("Дата матча и дедлайн обновлены.");
    } catch { setMessage("Ошибка переноса матча."); }
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
      setSessionUsername("");
      setUsername("");
      setPassword("");
      setActiveTab("schedule");
      setIsAdmin(false);
      setAdminData(null);
      setPredictions([]);
      setSchedule([]);
      setLeaderboard([]);
      setGrandPrix(null);
      setGrandPrixUnavailable(false);
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
      <div className="card" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: 12, marginBottom: 16 }}>
        {([["schedule", "Матчи"], ["ranking", "Рейтинг"], ["grand-prix", "Гран-при"], ["mine", "Мои прогнозы"], ...(isAdmin ? [["admin", "Администрирование"]] : [])] as string[][]).map(([id, label]) =>
          <button key={id} type="button" onClick={() => setActiveTab(id as typeof activeTab)}
            style={{ padding: "10px 14px", borderRadius: 10, border: activeTab === id ? "1px solid #2563eb" : "1px solid #d1d5db", background: activeTab === id ? "#dbeafe" : "#fff", fontWeight: 700, cursor: "pointer" }}>{label}</button>)}
        <div aria-label="Текущий пользователь" style={{ marginLeft: "auto", padding: "8px 12px", background: isAdmin ? "#fef3c7" : "#eff6ff", borderRadius: 10, fontWeight: 700, color: "#102d46" }}>
          {sessionUsername || "Неизвестный пользователь"} · {isAdmin ? "Администратор" : "Участник"}
        </div>
        <button type="button" onClick={logout} disabled={busy} style={{ padding: "10px 14px", borderRadius: 10 }}>Выйти</button>
      </div>
      {activeTab === "admin" && isAdmin && adminData && <section className="card" style={{ padding: 20, marginTop: 18 }}>
        <h2>ADMIN — новый тур в существующем этапе</h2>
        <form onSubmit={createTour} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 24 }}>
          <label>Этап <select required value={tourForm.stage_id}
            onChange={e => setTourForm(prev => ({ ...prev, stage_id: e.target.value }))}>
            <option value="">Выбери этап</option>
            {adminData.stages.map(s => <option key={s.id} value={s.id}>{s.name} (ID {s.id})</option>)}
          </select></label>
          <label>Номер тура <input required type="number" min="1" max="999"
            value={tourForm.tour_no} onChange={e => setTourForm(prev => ({ ...prev, tour_no: e.target.value }))} /></label>
          <label>Название тура <input maxLength={160} value={tourForm.name}
            onChange={e => setTourForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Тур 31" /></label>
          <button type="submit" disabled={busy || !adminWritesEnabled}>Создать тур</button>
        </form>
        <h2>ADMIN — переименование тура</h2>
        <form onSubmit={renameTour} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 24 }}>
          <label>Тур <select required value={renameTourForm.tour_id}
            onChange={e => {
              const tour = adminData.tours.find(t => t.id === e.target.value);
              setRenameTourForm({ tour_id: e.target.value, name: tour?.name ?? "" });
            }}>
            <option value="">Выбери тур</option>
            {adminData.tours.map(t => <option key={t.id} value={t.id}>{t.name} (ID {t.id})</option>)}
          </select></label>
          <label>Новое название <input required maxLength={160} value={renameTourForm.name}
            onChange={e => setRenameTourForm(prev => ({ ...prev, name: e.target.value }))} /></label>
          <button type="submit" disabled={busy || !adminWritesEnabled || !renameTourForm.tour_id}>Переименовать тур</button>
        </form>
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
        <h2>ADMIN — календарь (последние 150 матчей)</h2>
        <p>Импортированные матчи доступны для просмотра. Запись результатов через эту форму разрешена только для матчей, созданных в новой админке.</p>
        <div className="tableWrap"><table className="table" style={{ minWidth: 600 }}>
          <thead><tr><th>Дата</th><th>Матч</th><th>Статус</th><th>Источник</th></tr></thead>
          <tbody>{(adminData.matches ?? []).map(m => <tr key={m.id}>
            <td>{new Date(m.kickoff_at).toLocaleString("ru-RU")}</td>
            <td>{m.home_team} — {m.away_team}</td><td>{m.status}</td>
            <td>{m.admin_created ? "Создан в админке" : "Импортирован"}</td>
          </tr>)}</tbody>
        </table></div>
        <h2>ADMIN — перенос нового матча</h2>
        <p>Перенос доступен только для новых незавершённых матчей, на которые ещё нет прогнозов.</p>
        <form onSubmit={rescheduleMatch} style={{ display: "grid", gap: 10 }}>
          <label>Матч <select required value={rescheduleForm.match_id}
            onChange={e => setRescheduleForm(prev => ({ ...prev, match_id: e.target.value }))}>
            <option value="">Выбери новый матч</option>
            {(adminData.matches ?? []).filter(m => m.admin_created && m.status === "scheduled").map(m =>
              <option key={m.id} value={m.id}>{m.home_team} — {m.away_team} ({new Date(m.kickoff_at).toLocaleString("ru-RU")})</option>)}
          </select></label>
          <label>Новое начало <input required type="datetime-local" value={rescheduleForm.kickoff_at}
            onChange={e => setRescheduleForm(prev => ({ ...prev, kickoff_at: e.target.value }))} /></label>
          <label>Новый дедлайн <input required type="datetime-local" value={rescheduleForm.deadline_at}
            onChange={e => setRescheduleForm(prev => ({ ...prev, deadline_at: e.target.value }))} /></label>
          <button type="submit" disabled={busy || !adminWritesEnabled || !rescheduleForm.match_id}>Перенести матч</button>
        </form>
        <h2>ADMIN — результат матча</h2>
        <form onSubmit={finishMatch} style={{ display: "grid", gap: 10 }}>
          <label>Матч <select required value={resultForm.match_id}
            onChange={e => setResultForm(prev => ({ ...prev, match_id: e.target.value }))}>
            <option value="">Выбери незавершённый матч</option>
            {(adminData.matches ?? []).filter(m => m.status === "scheduled" && m.admin_created).map(m =>
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
      {activeTab === "ranking" && <section><h2 style={{ marginTop: 28 }}>Общий рейтинг</h2>
      <div className="tableWrap"><table className="table" style={{ minWidth: 500 }}>
        <thead><tr><th>Участник</th><th>Очки</th><th>Учтённых прогнозов</th></tr></thead>
        <tbody>{leaderboard.map(p => <tr key={p.username}>
          <td>{p.username}</td><td>{p.points}</td><td>{p.scored_predictions}</td>
        </tr>)}</tbody>
      </table></div></section>}
      {activeTab === "grand-prix" && <section><h2>Гран-при</h2>
        {grandPrixUnavailable && <p>Рейтинг Гран-при пока недоступен на этой тестовой площадке.</p>}
        {grandPrix?.seasons.map(season => <div key={season.id}>
          <h3>{season.name}</h3>
          <div className="tableWrap"><table className="table" style={{ minWidth: 450 }}>
            <thead><tr><th>Участник</th><th>Очки</th><th>Этапов с очками</th></tr></thead>
            <tbody>{grandPrix.ratings.filter(p => p.season_id === season.id).map(p =>
              <tr key={p.username}><td>{p.username}</td><td>{p.points}</td><td>{p.scored_rounds}</td></tr>)}</tbody>
          </table></div>
        </div>)}
      </section>}
      {activeTab === "schedule" && <section><h2>Расписание матчей ({schedule.length})</h2>
      <p>{writesEnabled ? "Прогнозы можно менять до дедлайна." : "Сохранение новых прогнозов пока отключено."}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        <button type="button" aria-pressed={matchFilter === "upcoming"} onClick={() => { setMatchFilter("upcoming"); setShowAllMatches(false); }} style={{ padding: "10px 14px", borderRadius: 10, background: matchFilter === "upcoming" ? "#dbeafe" : "#fff" }}>Предстоящие</button>
        <button type="button" aria-pressed={matchFilter === "all"} onClick={() => { setMatchFilter("all"); setShowAllMatches(false); }} style={{ padding: "10px 14px", borderRadius: 10, background: matchFilter === "all" ? "#dbeafe" : "#fff" }}>Все матчи</button>
      </div>
      {(matchFilter === "all" ? schedule : schedule.filter(m => m.kickoff_at && new Date(m.kickoff_at).getTime() > Date.now())).length > 30 && <button type="button" onClick={() => setShowAllMatches(v => !v)} style={{ margin: "12px 0", padding: "10px 14px", borderRadius: 10 }}>{showAllMatches ? "Показать первые 30" : "Показать больше матчей"}</button>}
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Дата</th><th>Матч</th><th>Прогноз</th><th>Результат</th>{writesEnabled && <th>Изменить прогноз</th>}</tr></thead>
        <tbody>{(showAllMatches ? (matchFilter === "all" ? schedule : schedule.filter(m => m.kickoff_at && new Date(m.kickoff_at).getTime() > Date.now())) : (matchFilter === "all" ? schedule : schedule.filter(m => m.kickoff_at && new Date(m.kickoff_at).getTime() > Date.now())).slice(0, 30)).map(m => <tr key={m.match_id}>
          <td>{m.kickoff_at ? new Date(m.kickoff_at).toLocaleString("ru-RU") : "—"}</td>
          <td>{m.home_team || "?"} — {m.away_team || "?"}</td>
          <td>{m.home_pred ?? "—"} : {m.away_pred ?? "—"}</td>
          <td>{m.home_score ?? "—"} : {m.away_score ?? "—"}</td>
          {writesEnabled && <td>{m.predictions_open ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minWidth: 210 }}>
            <input aria-label="Голы хозяев" type="number" min="0" max="99" style={{ width: 62, minHeight: 38, padding: 6, fontSize: 16, borderRadius: 8, border: "1px solid #94a3b8" }}
              value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).home}
              onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: e.target.value, away: (prev[m.match_id]?.away ?? String(m.away_pred ?? "")) } }))} />
            :
            <input aria-label="Голы гостей" type="number" min="0" max="99" style={{ width: 52 }}
              value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).away}
              onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: (prev[m.match_id]?.home ?? String(m.home_pred ?? "")), away: e.target.value } }))} />
            <button type="button" disabled={busy} onClick={() => void savePrediction(m)} style={{ minHeight: 38, padding: "7px 12px", borderRadius: 8, background: "#dbeafe", border: "1px solid #93c5fd", fontWeight: 700 }}>{savedMatchId === m.match_id ? "✓ Сохранено" : "Сохранить"}</button>
          </div> : "Закрыто"}</td>}
        </tr>)}</tbody>
      </table></div></section>}
      {activeTab === "mine" && <section><h2>Мои прогнозы ({predictions.length})</h2>
      <div className="tableWrap"><table className="table" style={{ minWidth: 500 }}>
        <thead><tr><th>Матч</th><th>Прогноз</th><th>Результат</th></tr></thead>
        <tbody>{predictions.map(p => <tr key={p.match_id}>
          <td>{p.home_team || "?"} — {p.away_team || "?"}</td>
          <td>{p.home_pred ?? "—"} : {p.away_pred ?? "—"}</td>
          <td>{p.home_score ?? "—"} : {p.away_score ?? "—"}</td>
        </tr>)}</tbody>
      </table></div></section>}
    </>}
  </main>;
}
