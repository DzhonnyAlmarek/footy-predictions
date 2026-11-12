"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import "./cutover.css";
import PointsPopover from "@/app/_components/points-popover";
import AnalyticsInsights from "./analytics-insights";
import AdminTourControl from "./admin-tour-control";

type Prediction = {
  match_id: string; kickoff_at: string | null; home_team: string | null; competition_label?: string | null;
  away_team: string | null; home_pred: number | null; away_pred: number | null;
  home_score: number | null; away_score: number | null;
  predictions_open?: boolean;
  pending_kickoff_date?: string | null;
};

// These 32 match kickoffs are week-start placeholders, not confirmed match times.
// When an administrator sets an actual kickoff, the warning disappears automatically.
const provisionalSpringTours: { firstId: number; lastId: number; kickoff: string }[] = [
  { firstId: 458, lastId: 465, kickoff: "2027-02-26T09:00:00.000Z" },
  { firstId: 466, lastId: 473, kickoff: "2027-03-05T09:00:00.000Z" },
  { firstId: 474, lastId: 481, kickoff: "2027-03-12T09:00:00.000Z" },
  { firstId: 482, lastId: 489, kickoff: "2027-03-19T09:00:00.000Z" }
];

function isProvisionalSpringKickoff(matchId: string, kickoff: string | null): boolean {
  if (!kickoff) return false;
  const numericId = Number(matchId);
  const timestamp = Date.parse(kickoff);
  if (!Number.isFinite(numericId) || !Number.isFinite(timestamp)) return false;
  return provisionalSpringTours.some(tour =>
    numericId >= tour.firstId && numericId <= tour.lastId
    && timestamp === Date.parse(tour.kickoff)
  );
}

function pendingKickoffLabel(date?: string | null) {
  return date ? `${date.split("-").reverse().join(".")} · Время уточняется` : "Дата не назначена";
}

function matchTime(iso: string | null) {
  return iso ? Date.parse(iso) : 0;
}

function CompetitionBadge({ label }: { label?: string | null }) {
  if (!label) return null;
  return <span title={`Турнир: ${label}`} style={{display:'inline-flex',alignItems:'center',padding:'2px 7px',marginLeft:6,borderRadius:6,border:'1px solid #9fbdad',background:'#eaf4ee',color:'#1c5940',fontSize:11,fontWeight:800,lineHeight:1.5,whiteSpace:'nowrap',verticalAlign:'middle'}}>{label}</span>;
}

const CUTOVER_TAB_SESSION = "murashev_cutover_tab_session_v1";

export default function CutoverParticipantPage() {
  const [activeTab, setActiveTab] = useState<"schedule" | "archive" | "analytics" | "golden-boot" | "ranking" | "golden-whistle" | "grand-prix" | "mine" | "admin">("mine");
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [matchFilter, setMatchFilter] = useState<"upcoming" | "all">("upcoming");
  const [analyticsGraphMode, setAnalyticsGraphMode] = useState<"gap" | "points">("gap");
  const [savedMatchId, setSavedMatchId] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [participants, setParticipants] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetUsername, setResetUsername] = useState("");
  const [redeemedPassword, setRedeemedPassword] = useState("");
  const [redeemedUsername, setRedeemedUsername] = useState("");
  const [resetCompletedFor, setResetCompletedFor] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [sessionUsername, setSessionUsername] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminData, setAdminData] = useState<{ teams: { id: string; name: string }[]; tournaments: { id: string; name: string }[]; stages: { id: string; name: string; status: string; is_current: boolean; matches_required: number; match_count: number; finished_count: number }[]; tours: { id: string; name: string; stage_id: string }[]; matches: { id: string; tour_id: string | null; status: string; home_score: number | null; away_score: number | null; home_penalty_goals: number | null; away_penalty_goals: number | null; kickoff_at: string | null; deadline_at: string | null; pending_kickoff_date?: string | null; home_team: string; away_team: string; competition_label?: string | null; home_team_id: string; away_team_id: string; admin_created: boolean; result_eligible: boolean }[]; delegated_predictions: {match_id:string;username:string}[]; prediction_writes_enabled:boolean } | null>(null);
  const [adminStageChoice, setAdminStageChoice] = useState("current");
  const [adminTourChoice, setAdminTourChoice] = useState("current");
  const [adminAction, setAdminAction] = useState("");
  const [newStageName, setNewStageName] = useState("");
  const [delegatedForm, setDelegatedForm] = useState({username:"",match_id:"",home_pred:"",away_pred:"",source_note:""});
  const [adminCalendarLoading, setAdminCalendarLoading] = useState(false);
  const [nextStageChoice, setNextStageChoice] = useState("");
  const [tourForm, setTourForm] = useState({ stage_id: "", tour_no: "", name: "" });
  const [renameTourForm, setRenameTourForm] = useState({ tour_id: "", name: "" });
  const [renameStageForm, setRenameStageForm] = useState({ stage_id: "", name: "" });
  const [adminForm, setAdminForm] = useState({ tournament_id: "", stage_id: "", tour_id: "", home_team_id: "", away_team_id: "", kickoff_at: "", deadline_at: "" });
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [schedule, setSchedule] = useState<Prediction[]>([]);
  const [boot, setBoot] = useState<{ username: string; exact: number }[]>([]);
  const [grandPrix, setGrandPrix] = useState<{ seasons: { id: string; name: string }[]; ratings: { season_id: string; username: string; points: string; scored_rounds: number }[] } | null>(null);
  const [grandPrixUnavailable, setGrandPrixUnavailable] = useState(false);
  const [grandPrixLoading, setGrandPrixLoading] = useState(false);
  // Refresh the season ranking whenever its tab opens, not only at sign-in.
  useEffect(() => {
    if (!authenticated || mustChangePassword || activeTab !== "grand-prix") return;
    let cancelled = false;
    const controller = new AbortController();
    setGrandPrixLoading(true);
    void fetch("/api/cutover/grand-prix", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("grand-prix");
        return response.json();
      })
      .then(data => {
        if (cancelled) return;
        setGrandPrix({
          seasons: Array.isArray(data.seasons) ? data.seasons : [],
          ratings: Array.isArray(data.ratings) ? data.ratings : []
        });
        setGrandPrixUnavailable(false);
      })
      .catch(() => {
        if (cancelled) return;
        setGrandPrix(null);
        setGrandPrixUnavailable(true);
      })
      .finally(() => { if (!cancelled) setGrandPrixLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [authenticated, mustChangePassword, activeTab]);
  const [whistle, setWhistle] = useState<{ stage: { id: string; name: string }; available_stages: { id: string; name: string; status: string }[]; penalty_matches: number; leaderboard: { username: string; points: number; main_place: number; breakdown?:{match_id:string;match:string;result:string;without_penalties:string;prediction:string;points:number;with_penalties_base:number;without_penalties_base:number;actual_points:number}[] }[] } | null>(null);
  const [whistleUnavailable, setWhistleUnavailable] = useState(false);
  const [whistleLoading, setWhistleLoading] = useState(false);
  const [leaderboard, setLeaderboard] = useState<{ username: string; points: string; bonus_points: string; scored_predictions: number }[]>([]);
  const [currentTable, setCurrentTable] = useState<{ stage:{id:string;name:string}|null;previous_stage?:{id:string;name:string}|null;previous_totals?:{user_id:string;username:string;points:string}[];previous_boot?:{user_id:string;exact:number}[]; tours:{id:string;name:string;tour_no:number}[]; users:{id:string;username:string}[]; rows:{match_id:string;tour_id:string|null;stage_match_no:number|null;kickoff_at:string|null;home_team:string;away_team:string;competition_label?:string|null;home_score:number|null;away_score:number|null;user_id:string|null;home_pred:number|null;away_pred:number|null;points:string|null;points_h1:string|null;points_h2:string|null;points_outcome:string|null;points_diff:string|null;points_bonus:string|null;points_outcome_base:string|null;points_outcome_bonus:string|null;points_diff_base:string|null;points_diff_bonus:string|null}[] }|null>(null);
  const [archive, setArchive] = useState<{stages:{id:string;name:string}[];stage:{id:string;name:string}|null;tours:{id:string;name:string;tour_no:number}[];users:{id:string;username:string}[];rows:{match_id:string;tour_id:string;stage_match_no:number|null;home_team:string;away_team:string;home_score:number|null;away_score:number|null;user_id:string|null;home_pred:number|null;away_pred:number|null;points:string|null}[]}|null>(null);
  const [archiveStageId,setArchiveStageId]=useState("");
  const [archiveWhistle,setArchiveWhistle]=useState<{penalty_matches:number;leaderboard:{username:string;points:number;breakdown?:{match_id:string;match:string;result:string;without_penalties:string;prediction:string;points:number;with_penalties_base:number;without_penalties_base:number;actual_points:number}[]}[]}|null>(null);
  const [archiveLoading,setArchiveLoading]=useState(false);
  const [archiveWhistleError,setArchiveWhistleError]=useState(false);
  useEffect(()=>{
    if(!authenticated || activeTab!=="archive") return;
    let cancelled=false;
    setArchiveLoading(true);
    setArchiveWhistleError(false);
    setArchiveWhistle(null);
    const suffix=archiveStageId?"?stageId="+encodeURIComponent(archiveStageId):"";
    void fetch("/api/cutover/archive"+suffix,{cache:"no-store"}).then(async res=>{if(!res.ok) throw new Error("archive");return res.json();})
      .then(data=>{
        if(cancelled)return;
        setArchive(data);
        if(data.stage?.id) void fetch("/api/cutover/golden-whistle?stageId="+encodeURIComponent(data.stage.id),{cache:"no-store"})
          .then(async res=>{if(!res.ok)throw new Error("whistle");return res.json();})
          .then(result=>{if(!cancelled){setArchiveWhistle(result);setArchiveWhistleError(false);}})
          .catch(()=>{if(!cancelled){setArchiveWhistle(null);setArchiveWhistleError(true);}});
      }).catch(()=>{if(!cancelled)setArchive(null);}).finally(()=>{if(!cancelled)setArchiveLoading(false);});
    return ()=>{cancelled=true;};
  },[authenticated,activeTab,archiveStageId]);
  const [tableLoading, setTableLoading] = useState(false);
  const [selectedTour, setSelectedTour] = useState("all");
  const [pastWhistleWinner, setPastWhistleWinner] = useState<string|null>(null);
  useEffect(() => {
    if (!authenticated) {
      setCurrentTable(null);
      setPastWhistleWinner(null);
      return;
    }
    let cancelled = false;
    let inFlight = false;
    let lastStageId: string | null = null;
    async function refreshCurrentTable() {
      if (cancelled || inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      setTableLoading(true);
      try {
        const res = await fetch("/api/cutover/current-table", { cache: "no-store" });
        if (!res.ok) throw new Error("table");
        const data = await res.json();
        if (cancelled) return;
        if (lastStageId !== (data?.stage?.id ?? null)) {
          lastStageId = data?.stage?.id ?? null;
          setSelectedTour("all");
        }
        setCurrentTable(data);
        // The previous stage and its awards may have changed while this tab was open.
        setPastWhistleWinner(null);
        if (data.previous_stage?.id) {
          const response = await fetch(
            "/api/cutover/golden-whistle?stageId=" + encodeURIComponent(data.previous_stage.id),
            { cache: "no-store" }
          );
          const result = response.ok ? await response.json() : null;
          if (!cancelled) {
            setPastWhistleWinner(
              result?.penalty_matches > 0 && Number(result?.leaderboard?.[0]?.points) > 0
                ? result.leaderboard[0].username
                : null
            );
          }
        }
      } catch {
        // Preserve the last successfully loaded table during temporary network errors.
      } finally {
        inFlight = false;
        if (!cancelled) setTableLoading(false);
      }
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") void refreshCurrentTable();
    };
    const onFocus = () => { void refreshCurrentTable(); };
    void refreshCurrentTable();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [authenticated]);
  const [message, setMessage] = useState("Проверяем сессию...");
  const [busy, setBusy] = useState(false);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [adminWritesEnabled, setAdminWritesEnabled] = useState(false);
  const [resultWritesEnabled, setResultWritesEnabled] = useState(false);
  const [resultDrafts, setResultDrafts] = useState<Record<string, { home_score: string; away_score: string; home_penalty_goals: string; away_penalty_goals: string }>>({});
  const [rescheduleForm, setRescheduleForm] = useState({ match_id: "", kickoff_at: "" });
  const [teamsEditForm, setTeamsEditForm] = useState({ match_id: "", home_team_id: "", away_team_id: "" });
  const [drafts, setDrafts] = useState<Record<string, { home: string; away: string }>>({});

  async function load() {
    const session = await fetch("/api/cutover/session", { cache: "no-store" });
    if (!session.ok) { setSessionUsername(""); setAuthenticated(false); setIsAdmin(false); setMustChangePassword(false); setAdminData(null); setMessage("Войди, чтобы увидеть свои прогнозы."); return; }
    const sessionData = await session.json();
    setSessionUsername(typeof sessionData.username === "string" ? sessionData.username : "");
    setIsAdmin(sessionData.role === "admin");
    setActiveTab(prev => sessionData.role === "admin" ? ((prev === "mine" || prev === "schedule") ? "admin" : prev) : (prev === "schedule" || prev === "admin" ? "mine" : prev));
    setMustChangePassword(sessionData.must_change_password === true);
    // Temporary credentials must be changed before loading predictions.
    // The prediction API deliberately refuses these sessions.
    if (sessionData.must_change_password === true) {
      setAuthenticated(true);
      setPredictions([]);
      setSchedule([]);
      setWritesEnabled(false);
      setAdminData(null);
      setMessage("Установи новый пароль, чтобы продолжить.");
      return;
    }
    if (sessionData.role !== "admin") {
      setAdminData(null);
      setAdminWritesEnabled(false);
      setResultWritesEnabled(false);
    }
    // Session confirmation is the login boundary. Optional data must not block it.
    setAuthenticated(true);
    setMessage("");
    void (async () => { try {
    if (sessionData.role === "admin") {
      const adminQuery = adminStageChoice === "current" ? "" : "?stage_id=" + encodeURIComponent(adminStageChoice);
      const adminResponse = await fetch("/api/cutover/admin" + adminQuery, { cache: "no-store" });
      if (adminResponse.ok) {
        const adminPayload = await adminResponse.json();
        setAdminData(adminPayload);
        setAdminWritesEnabled(adminPayload.writes_enabled === true);
        setResultWritesEnabled(adminPayload.result_writes_enabled === true);
      } else {
        setAdminData(null);
        setAdminWritesEnabled(false);
        setResultWritesEnabled(false);
      }
    }
    const response = await fetch("/api/cutover/my-predictions", { cache: "no-store" });
    if (!response.ok) { setMessage("Не удалось получить прогнозы. Попробуй обновить страницу."); return; }
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
    const bootResponse = await fetch("/api/cutover/golden-boot", { cache: "no-store" }).catch(() => null);
    if (bootResponse?.ok) { const bootData = await bootResponse.json(); setBoot(Array.isArray(bootData.leaderboard) ? bootData.leaderboard : []); }
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
    const whistleResponse = await fetch("/api/cutover/golden-whistle", { cache: "no-store" }).catch(() => null);
    if (whistleResponse?.ok) {
      const data = await whistleResponse.json();
      setWhistle(data);
      setWhistleUnavailable(false);
    } else { setWhistle(null); setWhistleUnavailable(true); }
    } catch { setMessage("Часть данных временно недоступна. Повтори загрузку страницы."); } })();
  }
  useEffect(() => {
    // Cookies alone must never restore the participant cabinet in a freshly
    // opened tab. sessionStorage normally expires on tab close and survives F5.
    let tabActive = false;
    try { tabActive = sessionStorage.getItem(CUTOVER_TAB_SESSION) === "1"; } catch {}
    const initialize = async () => {
      if (!tabActive) {
        // The session cookie is shared by all tabs. Do NOT revoke it here:
        // opening a second tab must not log out an already active first tab.
        // The new tab stays at the login form until explicitly authenticated.
        setSessionUsername("");
        setAuthenticated(false);
        setIsAdmin(false);
        setMustChangePassword(false);
        setAdminData(null);
        setMessage("");
      } else {
        await load().catch(() => setMessage("Сервис пока недоступен."));
      }
    };
    void initialize();
    void fetch("/api/cutover/participants", { cache: "no-store" })
      .then(response => response.ok ? response.json() : { participants: [] })
      .then(data => setParticipants(Array.isArray(data.participants) ? data.participants : []))
      .catch(() => setParticipants([]));
  }, []);

  useEffect(() => {
    const match = /^#reset=([0-9a-f]{64})$/.exec(window.location.hash);
    if (!match) return;
    // Remove bearer token from the address bar immediately after reading it.
    window.history.replaceState(null, "", window.location.pathname + window.location.search);
    void fetch("/api/cutover/redeem-reset-link", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: match[1] })
    }).then(async response => {
      const result = await response.json();
      if (!response.ok || !result.temporary_password) {
        setMessage("Ссылка восстановления недействительна или уже использована.");
        return;
      }
      setRedeemedUsername(result.username);
      setRedeemedPassword(result.temporary_password);
      setUsername(result.username);
      setAuthenticated(false);
      setMessage("Временный пароль выдан. Сохрани его: после закрытия страницы он не будет показан повторно.");
    }).catch(() => setMessage("Не удалось открыть ссылку восстановления."));
  }, []);

  async function selectWhistleStage(stageId: string) {
    setWhistleLoading(true);
    try {
      const response = await fetch("/api/cutover/golden-whistle?stageId=" + encodeURIComponent(stageId), { cache: "no-store" });
      if (!response.ok) { setWhistleUnavailable(true); return; }
      setWhistle(await response.json());
      setWhistleUnavailable(false);
    } catch { setWhistleUnavailable(true); }
    finally { setWhistleLoading(false); }
  }

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
      try { sessionStorage.setItem(CUTOVER_TAB_SESSION, "1"); }
      catch {
        await fetch("/api/cutover/logout", { method: "POST" }).catch(() => {});
        setMessage("Для входа разреши хранение данных вкладки в браузере.");
        return;
      }
      await load();
    } catch { setMessage("Не удалось подключиться."); }
    finally { setBusy(false); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (newPassword !== confirmPassword) { setMessage("Новые пароли не совпадают."); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/change-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_password: newPassword })
      });
      if (!response.ok) { setMessage("Пароль не изменён. Проверь длину нового пароля (5–128 символов) или войди заново."); return; }
       setNewPassword(""); setConfirmPassword("");
      setMustChangePassword(false); setAuthenticated(false);
      setMessage("Пароль изменён. Войди с новым паролем.");
    } catch { setMessage("Не удалось изменить пароль."); }
    finally { setBusy(false); }
  }
  async function resetParticipantPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin/reset-password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: resetUsername })
      });
      if (!response.ok) { setResetCompletedFor(""); setMessage("Не удалось сбросить пароль участника."); return; }
      setResetCompletedFor(resetUsername);
      setMessage("Пароль участника сброшен на стандартный. При следующем входе потребуется установить постоянный.");
    } catch { setResetCompletedFor(""); setMessage("Сброс пароля временно недоступен."); }
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
  // Reload the complete calendar for the selected stage. The admin API filters
  // by stage in SQL, so old stages never disappear behind a global LIMIT.
  useEffect(() => {
    if (!authenticated || !isAdmin || activeTab !== "admin") return;
    let cancelled = false;
    setAdminCalendarLoading(true);
    const query = adminStageChoice === "current" ? "" : "?stage_id=" + encodeURIComponent(adminStageChoice);
    void fetch("/api/cutover/admin" + query, { cache: "no-store" })
      .then(async response => { if (!response.ok) throw new Error("admin_calendar"); return response.json(); })
      .then(payload => { if (!cancelled) {
        setAdminData(payload);
        setAdminWritesEnabled(payload.writes_enabled === true);
        setResultWritesEnabled(payload.result_writes_enabled === true);
      } })
      .catch(() => { if (!cancelled) setMessage("Не удалось загрузить календарь выбранного этапа."); })
      .finally(() => { if (!cancelled) setAdminCalendarLoading(false); });
    return () => { cancelled = true; };
  }, [authenticated, isAdmin, activeTab, adminStageChoice]);

  async function closeCurrentStage() {
    const current = adminData?.stages.find(s => s.is_current);
    const next = adminData?.stages.find(s => s.id === nextStageChoice && s.status === "draft");
    if (!current || !next || busy) return;
    if (!window.confirm(`Закрыть «${current.name}» и сделать текущим «${next.name}»? Отменить это действие через интерфейс нельзя.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"close_stage",stage_id:current.id,next_stage_id:next.id})
      });
      if (!response.ok) {
        setMessage("Этап не закрыт: проверь 56 завершённых матчей, начисления и готовность следующего этапа.");
        return;
      }
      setNextStageChoice("");
      setAdminStageChoice("current");
      setAdminTourChoice("current");
      setCurrentTable(null);
      await load();
      setMessage(`Этап «${current.name}» закрыт. Текущий этап: «${next.name}».`);
    } catch { setMessage("Не удалось закрыть этап. Данные не изменены, если операция отклонена сервером."); }
    finally {setBusy(false);}
  }
  async function createStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newStageName.trim();
    if (!name || busy) return;
    if (!window.confirm("Создать пустой черновой этап «" + name + "»? Текущий этап не изменится.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"create_stage",name})});
      if (!response.ok) {setMessage(response.status===409 ? "Этап с таким названием уже существует." : "Не удалось создать этап.");return;}
      setNewStageName("");
      await load();
      setMessage("Создан этап «" + name + "». Добавь туры и матчи.");
    } catch {setMessage("Ошибка соединения при создании этапа.");}
    finally {setBusy(false);}
  }
  async function saveDelegatedPrediction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = delegatedForm;
    if (!f.username || !f.match_id || !/^[0-9]{1,2}$/.test(f.home_pred) ||
        !/^[0-9]{1,2}$/.test(f.away_pred) || f.source_note.trim().length < 3) {
      setMessage("Выбери участника, матч, счёт и укажи источник прогноза.");return;
    }
    const match = adminData?.matches.find(m=>m.id===f.match_id);
    const existing = adminData?.delegated_predictions?.find(p=>p.match_id===f.match_id && p.username===f.username);
    const summary = f.username + ": " + (match?.home_team ?? "?") + " — " + (match?.away_team ?? "?") + " " + f.home_pred + ":" + f.away_pred;
    if (!window.confirm((existing ? "Заменить прогноз?" : "Записать прогноз?") + "\n" + summary + "\nИсточник: " + f.source_note)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"save_for_participant",username:f.username,match_id:f.match_id,
          home_pred:Number(f.home_pred),away_pred:Number(f.away_pred),source_note:f.source_note.trim()})});
      if (!response.ok) {
        setMessage(response.status===409 ? "Прогноз не записан: срок подачи истёк, матч закрыт или участник не найден."
          : "Не удалось сохранить прогноз. Проверь доступность журнала административных действий.");return;
      }
      setDelegatedForm(prev=>({...prev,match_id:"",home_pred:"",away_pred:"",source_note:""}));
      await load();setMessage("Прогноз сохранён и внесён в журнал: " + summary);
    } catch {setMessage("Ошибка соединения при сохранении прогноза.");}
    finally {setBusy(false);}
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
      if (!response.ok) { setMessage(response.status === 404 ? "Тур не найден или в нём уже есть матчи." : "Не удалось переименовать тур."); return; }
      setRenameTourForm({ tour_id: "", name: "" });
      await load();
      setMessage("Название тура изменено.");
    } catch { setMessage("Ошибка соединения при переименовании тура."); }
    finally { setBusy(false); }
  }
  async function renameStage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!renameStageForm.stage_id || !renameStageForm.name.trim()) return;
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename_stage", ...renameStageForm })
      });
      if (!response.ok) {
        setMessage(response.status === 409
          ? "Этап недоступен для переименования: он не черновой либо уже содержит туры или матчи."
          : "Не удалось переименовать этап."); return;
      }
      setRenameStageForm({ stage_id: "", name: "" });
      await load();
      setMessage("Название чернового этапа изменено.");
    } catch { setMessage("Ошибка соединения при переименовании этапа."); }
    finally { setBusy(false); }
  }
  async function createMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const kickoff = new Date(adminForm.kickoff_at + ":00+03:00");
    const deadline = new Date(adminForm.deadline_at + ":00+03:00");
    if (!Number.isFinite(kickoff.getTime()) || !Number.isFinite(deadline.getTime()) ||
        deadline > kickoff || deadline.getTime() <= Date.now()) {
      setMessage("Проверь московское время матча и окончания приёма прогнозов.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_match", ...adminForm,
          kickoff_at: kickoff.toISOString(),
          deadline_at: deadline.toISOString() }) });
      if (!response.ok) { setMessage("Матч не создан. Проверь данные и разрешение на запись."); return; }
      await load(); setMessage("Матч создан.");
    } catch { setMessage("Не удалось создать матч."); }
    finally { setBusy(false); }
  }
  async function editMatchTeams(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!teamsEditForm.match_id || !teamsEditForm.home_team_id || !teamsEditForm.away_team_id ||
        teamsEditForm.home_team_id === teamsEditForm.away_team_id) {
      setMessage("Выбери матч и две разные команды."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit_match_teams", ...teamsEditForm })
      });
      if (!response.ok) { setMessage("Замена команд отклонена: матч закрыт, дедлайн истёк, уже есть прогнозы или конфликт команд."); return; }
      setTeamsEditForm({ match_id: "", home_team_id: "", away_team_id: "" });
      await load();
      setMessage("Команды матча обновлены.");
    } catch { setMessage("Ошибка при изменении команд."); }
    finally { setBusy(false); }
  }
  function moscowInput(iso: string) {
    const parts = new Intl.DateTimeFormat("sv-SE", {timeZone:"Europe/Moscow",year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).formatToParts(new Date(iso));
    const val = (key:string) => parts.find(p=>p.type===key)?.value ?? "00";
    return `${val("year")}-${val("month")}-${val("day")}T${val("hour")}:${val("minute")}`;
  }
  async function rescheduleMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduleForm.match_id || !/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}$/.test(rescheduleForm.kickoff_at)) return;
    const kickoff = new Date(rescheduleForm.kickoff_at + ":00+03:00");
    if (!Number.isFinite(kickoff.getTime()) || kickoff.getTime() <= Date.now()) {
      setMessage("Начало матча должно быть в будущем (московское время)."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reschedule_match", match_id: rescheduleForm.match_id,
          kickoff_at: kickoff.toISOString(), deadline_at: kickoff.toISOString() })
      });
      if (!response.ok) { setMessage("Изменение отклонено: матч уже начался, закрыт или на него есть прогнозы."); return; }
      setRescheduleForm({ match_id: "", kickoff_at: "" });
      await load();
      setMessage("Дата и время матча обновлены (МСК). Срок подачи прогнозов изменён вместе с началом матча.");
    } catch { setMessage("Не удалось обновить календарь."); }
    finally { setBusy(false); }
  }
  async function finishMatch(matchId: string) {
    const draft = resultDrafts[matchId];
    if (!draft || !/^[0-9]{1,2}$/.test(draft.home_score) || !/^[0-9]{1,2}$/.test(draft.away_score)) {
      setMessage("Укажи счёт от 0 до 99."); return;
    }
    const hp = Number(draft.home_penalty_goals || "0"), ap = Number(draft.away_penalty_goals || "0");
    if (![hp, ap].every(Number.isInteger) || hp < 0 || ap < 0 || hp > Number(draft.home_score) || ap > Number(draft.away_score)) {
      setMessage("Голы с пенальти должны быть от 0 до числа голов команды."); return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/cutover/admin", { method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "result", match_id: matchId,
          home_score: Number(draft.home_score), away_score: Number(draft.away_score), home_penalty_goals: hp, away_penalty_goals: ap }) });
      if (!response.ok) { setMessage("Результат не записан. Матч уже завершён, не найден или запись отключена."); return; }
      setResultDrafts(prev => { const next = { ...prev }; delete next[matchId]; return next; });
      setCurrentTable(null);
      await load(); setMessage("Результат записан, очки рассчитаны.");
    } catch { setMessage("Ошибка сохранения результата."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true);
    try { sessionStorage.removeItem(CUTOVER_TAB_SESSION); } catch {}
    try {
      const response = await fetch("/api/cutover/logout", { method: "POST" });
      if (!response.ok) { setMessage("Не удалось завершить сессию."); return; }
      setAuthenticated(false);
      setSessionUsername("");
      setUsername("");
      setPassword("");
      setActiveTab("mine");
      setIsAdmin(false);
      setMustChangePassword(false);
      setAdminData(null);
      setAdminWritesEnabled(false);
      setResultWritesEnabled(false);
      setWritesEnabled(false);
      setPredictions([]);
      setSchedule([]);
      setLeaderboard([]);
      setGrandPrix(null);
      setGrandPrixUnavailable(false);
      setWhistle(null);
      setWhistleUnavailable(false);
      setWhistleLoading(false);
      setWritesEnabled(false);
      setAdminWritesEnabled(false);
      setResultWritesEnabled(false);
      setMessage("Ты вышел из системы.");
    } catch { setMessage("Не удалось завершить сессию."); }
    finally { setBusy(false); }
  }

  const stageTotals = currentTable?.users.map(u=>({ ...u, points: Number((currentTable.rows.filter(row=>row.user_id===u.id).reduce((sum,row)=>sum+Number(row.points??0),0)).toFixed(2)) })).sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username,"ru")) ?? [];
  const currentRankIndex = stageTotals.findIndex(u=>u.username===sessionUsername);
  const currentRank = currentRankIndex>=0 ? stageTotals[currentRankIndex] : null;
  const previousRankIndex = currentTable?.previous_totals?.findIndex(p=>p.username===sessionUsername) ?? -1;
  const priorBootWinner = currentTable?.previous_boot?.[0];
  const priorBootIsWinner = priorBootWinner && Number(priorBootWinner.exact)>0 && currentTable?.previous_boot?.some(p=>p.user_id===priorBootWinner.user_id && currentTable.users.some(u=>u.id===p.user_id && u.username===sessionUsername));
  const previousTitle = isAdmin ? "" : [
    previousRankIndex===0?"Действующий победитель":previousRankIndex===1?"Серебряный призёр":previousRankIndex===2?"Бронзовый призёр":"",
    priorBootIsWinner?"Обладатель Золотой бутсы":"",
    pastWhistleWinner===sessionUsername?"Обладатель Золотого свистка":""
  ].filter(Boolean).join(" · ");
  const activeAdminStage = isAdmin ? adminData?.stages.find(stage=>stage.is_current) : null;
  const stageMatchCount = activeAdminStage
    ? activeAdminStage.match_count
    : currentTable ? new Set(currentTable.rows.map(row=>row.match_id)).size : 0;
  const finishedStageMatches = activeAdminStage
    ? activeAdminStage.finished_count
    : currentTable ? new Set(currentTable.rows.filter(row=>row.home_score!==null&&row.away_score!==null).map(row=>row.match_id)).size : 0;
  const upcomingMatches = schedule.filter(m => m.pending_kickoff_date || matchTime(m.kickoff_at) > Date.now());
  const savedForecasts = schedule.filter(m => m.home_pred !== null && m.away_pred !== null).length;
  const myPlace = leaderboard.findIndex(p => p.username === sessionUsername);
  const myRanking = myPlace >= 0 ? leaderboard[myPlace] : null;

  const scheduleSelection = matchFilter === "all" ? schedule : upcomingMatches;
  const displayedSchedule = showAllMatches ? scheduleSelection : scheduleSelection.slice(0, 30);

  return <main className="page cutover-shell">
    <div className="cutover-club-banner" aria-label="Название клуба и дата основания">
      <div className="cutover-club-identity">
        <img className="cutover-club-symbol cutover-club-ball cutover-club-ball-photo" src="/club-ball-photo.webp" width="64" height="64" alt="" aria-hidden="true" />
        <div className="cutover-club-copy">
          <strong>Клуб им. А.Н. Мурашева</strong>
        </div>
      </div>
      <span className="cutover-club-founded">Основан 6 июня 2008 года</span>
    </div>
    <header className="cutover-hero">
      <div className="cutover-hero-content"><h1>Точность решает</h1>
        <p>Твой матч. Твой прогноз. Твоя история побед.</p>
      </div>

    </header>
    {message && message !== "Войди, чтобы увидеть свои прогнозы." && message !== "Проверяем сессию..." && <div role="status" aria-live="polite" className="cutover-notice">{message}</div>}
    {redeemedPassword && <section className="card" style={{ padding: 20, margin: "12px auto", maxWidth: 520 }}>
      <h2>Временный пароль для {redeemedUsername}</h2>
      <p>Ссылка использована и больше не действует. Сохрани пароль и введи его при входе, затем установи постоянный пароль от 5 символов.</p>
      <p><code style={{ userSelect: "all" }}>{redeemedPassword}</code></p>
      <button type="button" onClick={() => void navigator.clipboard.writeText(redeemedPassword)}>Скопировать пароль</button>
      <button type="button" onClick={() => setRedeemedPassword("")}>Скрыть пароль</button>
    </section>}
    {!authenticated ? <form onSubmit={login} className="card cutover-login" style={{ padding: 22, display: "grid", gap: 14, maxWidth: 520, margin: "0 auto" }}><div className="cutover-form-heading"><h2>Вход</h2>{username && <p style={{ fontWeight: 700, marginTop: 6 }}>Выбран участник: {username}</p>}</div>
      <label>Участник <select value={username} onChange={e => setUsername(e.target.value)} required>
        <option value="">Выбери участника</option>
        {participants.map(name => <option key={name} value={name}>{name}</option>)}
      </select></label>
      <label>Пароль <input type="password" value={password}
        onChange={e => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <button type="submit" disabled={busy}>Войти</button>
    </form> : mustChangePassword ? <form onSubmit={changePassword} className="card cutover-login" style={{ padding: 22, display: "grid", gap: 14, maxWidth: 520, margin: "0 auto" }}>
      <h2>Обязательная смена временного пароля</h2>
      <p style={{ fontWeight: 700, marginTop: 4 }}>Участник: {sessionUsername || "Не определён"}</p>
      <p>Введи новый постоянный пароль и повтори его. После подтверждения нужно войти заново.</p>
      <label>Новый пароль <input type="password" autoComplete="new-password" required minLength={5} maxLength={128} value={newPassword} onChange={e => setNewPassword(e.target.value)} aria-describedby="cutover-password-hint" /><small id="cutover-password-hint" style={{ display: "block", marginTop: 6, color: "#526475" }}>Не менее 5 символов.</small></label>
      <label>Повтори пароль <input type="password" autoComplete="new-password" required value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} /></label>
      <button type="submit" disabled={busy}>Подтвердить пароль</button>
      <button type="button" onClick={() => void logout()} disabled={busy}>Выйти</button>
    </form> : <>
      <nav aria-label="Разделы кабинета" className="card cutover-navigation">
        {([...(!isAdmin ? [["mine", "Мои прогнозы"]] : []), ["ranking", "Текущая таблица"], ["analytics", "Аналитика"], ["golden-boot", "Бутса"], ["golden-whistle", "Свисток"], ["grand-prix", "Гран-при"], ["archive", "Архив"], ...(isAdmin ? [["admin", "Администрирование"]] : [])] as string[][]).map(([id, label]) =>
          <button key={id} type="button" onClick={() => setActiveTab(id as typeof activeTab)}
            className={activeTab === id ? "cutover-nav-item is-active" : "cutover-nav-item"} aria-current={activeTab === id ? "page" : undefined}>{label}</button>)}
        <div aria-label="Текущий пользователь" className={isAdmin ? "cutover-user-chip is-admin" : "cutover-user-chip"}>
          {sessionUsername || "Неизвестный пользователь"} · {isAdmin ? "Администратор" : "Участник"}
        </div>
        <button type="button" onClick={logout} disabled={busy} className="cutover-logout">Выйти</button>
      </nav>
      <section className="cutover-overview" aria-label="Обзор текущего этапа">
        <div className="cutover-stat"><span>МАТЧИ ТЕКУЩЕГО ЭТАПА</span><strong>{stageMatchCount || "—"}</strong><small>{finishedStageMatches} завершено</small></div>
        {!isAdmin && <div className="cutover-stat"><span>МОЁ МЕСТО В ТЕКУЩЕМ ЭТАПЕ</span><strong>{currentRankIndex>=0 ? "#"+(currentRankIndex+1) : "—"}</strong><small>{currentRank ? currentRank.points+" очков" : "Нет данных"}</small></div>}
        {!isAdmin && previousTitle && <div className="cutover-stat cutover-stat-accent"><span>МОЙ СТАТУС</span><strong className="cutover-status-title">{previousTitle.split(" · ")[0]}</strong>{previousTitle.includes(" · ") && <span className="cutover-status-awards">{previousTitle.split(" · ").slice(1).join(" · ")}</span>}<small>{currentTable?.previous_stage?.name ?? "Предыдущий этап"}</small></div>}
      </section>
      {activeTab === "admin" && isAdmin && adminData && <section className="card cutover-admin-panel" style={{ padding: 20, marginTop: 18 }}>
        <div className="cutover-section-heading"><div><span>УПРАВЛЕНИЕ ТУРНИРОМ</span><h2>Панель администратора</h2></div><p>Матчи, туры и результаты — в одном месте</p></div>
        {(() => {
          const stage = adminData.stages.find(s=>s.is_current);
          return stage ? <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"10px 0 16px"}}>
            <strong>{stage.name}</strong>
            <span>{stage.finished_count} из {stage.matches_required} матчей завершено</span>
            <span>Осталось: {Math.max(0,stage.match_count-stage.finished_count)}</span>
            <span>{adminWritesEnabled ? "Изменения разрешены" : "Режим просмотра"}</span>
          </div> : null;
        })()}
        <AdminTourControl
          currentStageId={adminData.stages.find(stage=>stage.is_current)?.id ?? ""}
          currentStageName={adminData.stages.find(stage=>stage.is_current)?.name ?? "Текущий этап"}
          selectedTourId={adminTourChoice}
          onSelectTour={setAdminTourChoice}
          selectedStageId={adminStageChoice==="current" ? (adminData.stages.find(stage=>stage.is_current)?.id ?? "") : adminStageChoice}
          matches={adminData.matches}
          tours={adminData.tours}
          table={currentTable}
        />
        <h2>Календарь матчей</h2>
        <p style={{margin:"0 0 10px",opacity:.75}}>Показываются матчи выбранного этапа. Все даты и время — московские. Для туров 18–21 весны 2027 года время 12:00 МСК предварительное и одновременно используется системой как дедлайн прогнозов. После утверждения расписания необходимо изменить время каждого матча.</p>
        <div style={{display:"flex",flexWrap:"wrap",gap:12,alignItems:"end",marginBottom:12}}>
          <label>Этап <select value={adminStageChoice} onChange={e=>{setAdminStageChoice(e.target.value);setAdminTourChoice("current");setDelegatedForm(prev=>({...prev,match_id:"",home_pred:"",away_pred:""}));}}>
            <option value="current">Текущий — {adminData.stages.find(s=>s.is_current)?.name ?? "не определён"}</option>
            {adminData.stages.filter(stage=>!stage.is_current).map(stage=><option key={stage.id} value={stage.id}>{stage.name}</option>)}
          </select></label>
          <label>Тур <select value={adminTourChoice} onChange={e=>setAdminTourChoice(e.target.value)}>
            <option value="current">Все туры этапа</option>
            {adminData.tours.filter(t=>t.stage_id===(adminStageChoice==="current"?adminData.stages.find(s=>s.is_current)?.id:adminStageChoice)).map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
        </div>
        {adminCalendarLoading && <p>Загружаем календарь выбранного этапа…</p>}
        {!adminCalendarLoading && (() => {
          const activeStageId=adminStageChoice==="current"?adminData.stages.find(stage=>stage.is_current)?.id:adminStageChoice;
          const allowedTours=new Set(adminData.tours.filter(t=>t.stage_id===activeStageId && (adminTourChoice==="current" || t.id===adminTourChoice)).map(t=>t.id));
          const grouped = new Map<string, typeof adminData.matches>();
          for (const match of adminData.matches) {
            if (!match.tour_id || !allowedTours.has(match.tour_id)) continue;
            const key = match.tour_id;
            grouped.set(key, [...(grouped.get(key) ?? []), match]);
          }
          const now = Date.now();
          const ordered = [...grouped.entries()].sort((a, b) => {
            const priority = (matches: typeof adminData.matches) => {
              const pending = matches.filter(m => m.status === "scheduled");
              const candidates = pending.length ? pending : matches;
              return { pending: pending.length > 0, distance: Math.min(...candidates.map(m => Math.abs(matchTime(m.kickoff_at) - now))) };
            };
            const pa = priority(a[1]), pb = priority(b[1]);
            const tourNumber = (id: string) => {
              const name = adminData.tours.find(t => t.id === id)?.name ?? "";
              const found = name.match(/(?:тур|tour)\s*(\d+)/i);
              return found ? Number(found[1]) : Number.MAX_SAFE_INTEGER;
            };
            return Number(pb.pending) - Number(pa.pending)
              || tourNumber(a[0]) - tourNumber(b[0])
              || pa.distance - pb.distance;
          });
          return ordered.length===0 ? <p>Для выбранного этапа нет матчей в загруженном календаре.</p> : ordered.map(([tourId, matches]) => {
            const tour = adminData.tours.find(t => t.id === tourId);
            return <details key={tourId} open={ordered[0]?.[0] === tourId} style={{ marginBottom: 12 }}>
              <summary style={{ cursor: "pointer", fontWeight: 700, padding: "8px 0" }}>{tour?.name ?? "Без тура"} · {matches.length} матчей</summary>
              <div className="tableWrap"><table className="table" style={{ minWidth: 480 }}>
                <thead><tr><th>Матч и начало (МСК)</th><th>Результат</th></tr></thead>
                <tbody>{[...matches].sort((a,b) => matchTime(a.kickoff_at ?? a.pending_kickoff_date ?? null)-matchTime(b.kickoff_at ?? b.pending_kickoff_date ?? null) || Number(a.id)-Number(b.id)).map(m => <tr key={m.id}>
                  <td>
                    <strong>{m.home_team} — {m.away_team}</strong><CompetitionBadge label={m.competition_label} />
                    <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginTop:4}}>
                      <small>{m.kickoff_at ? new Date(m.kickoff_at).toLocaleString("ru-RU", {timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}) + " МСК" : pendingKickoffLabel(m.pending_kickoff_date)}{isProvisionalSpringKickoff(m.id, m.kickoff_at) && <strong style={{marginLeft:6}}>· Предварительно (время техническое)</strong>}</small>
                      {m.status==="scheduled" && adminWritesEnabled && (m.pending_kickoff_date || matchTime(m.deadline_at)>Date.now()) &&
                        (rescheduleForm.match_id===m.id
                          ? <form onSubmit={rescheduleMatch} style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                              <input aria-label={`Новое время: ${m.home_team} — ${m.away_team}`} type="datetime-local" required value={rescheduleForm.kickoff_at}
                                onChange={e=>setRescheduleForm(prev=>({...prev,kickoff_at:e.target.value}))}/>
                              <small>МСК</small>
                              <button type="submit" disabled={busy}>Сохранить</button>
                              <button type="button" onClick={()=>setRescheduleForm({match_id:"",kickoff_at:""})}>Отмена</button>
                            </form>
                          : <button type="button" style={{background:"transparent",border:0,padding:0,fontSize:12,textDecoration:"underline",opacity:.7,cursor:"pointer"}} disabled={busy} onClick={()=>setRescheduleForm({match_id:m.id,kickoff_at:m.kickoff_at ? moscowInput(m.kickoff_at) : ""})}>✎ Изменить время</button>)}
                    </div>
                  </td>
                  <td>{m.status === "finished"
                    ? (m.home_score == null || m.away_score == null ? "—" : <span>{m.home_score}:{m.away_score}<small style={{ marginLeft: 10, whiteSpace: "nowrap", opacity: .8 }}>Пен. {m.home_penalty_goals == null && m.away_penalty_goals == null ? "—" : `${m.home_penalty_goals ?? 0}:${m.away_penalty_goals ?? 0}`}</small></span>)
                    : m.result_eligible && adminWritesEnabled && resultWritesEnabled
                      ? <div className="cutover-admin-score-entry" style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                          <input aria-label={`Голы хозяев: ${m.home_team} — ${m.away_team}`} type="number" min="0" max="99" required style={{ width: 65 }}
                            value={resultDrafts[m.id]?.home_score ?? ""}
                            onChange={e => setResultDrafts(prev => ({ ...prev, [m.id]: { home_score: e.target.value, away_score: prev[m.id]?.away_score ?? "", home_penalty_goals: prev[m.id]?.home_penalty_goals ?? "0", away_penalty_goals: prev[m.id]?.away_penalty_goals ?? "0" } }))} />
                          <span>:</span>
                          <input aria-label={`Голы гостей: ${m.home_team} — ${m.away_team}`} type="number" min="0" max="99" required style={{ width: 65 }}
                            value={resultDrafts[m.id]?.away_score ?? ""}
                            onChange={e => setResultDrafts(prev => ({ ...prev, [m.id]: { home_score: prev[m.id]?.home_score ?? "", away_score: e.target.value, home_penalty_goals: prev[m.id]?.home_penalty_goals ?? "0", away_penalty_goals: prev[m.id]?.away_penalty_goals ?? "0" } }))} />
                          <span title="Забитые пенальти в итоговом счёте" style={{ whiteSpace: "nowrap", marginLeft: 8 }}>Пен.</span>
                          <input aria-label={`Пенальти хозяев: ${m.home_team}`} title="Голы хозяев с пенальти" type="number" min="0" max="99" style={{ width: 46 }}
                            value={resultDrafts[m.id]?.home_penalty_goals ?? "0"}
                            onChange={e => setResultDrafts(prev => ({ ...prev, [m.id]: { home_score: prev[m.id]?.home_score ?? "", away_score: prev[m.id]?.away_score ?? "", home_penalty_goals: e.target.value, away_penalty_goals: prev[m.id]?.away_penalty_goals ?? "0" } }))} />
                          <span>:</span>
                          <input aria-label={`Пенальти гостей: ${m.away_team}`} title="Голы гостей с пенальти" type="number" min="0" max="99" style={{ width: 46 }}
                            value={resultDrafts[m.id]?.away_penalty_goals ?? "0"}
                            onChange={e => setResultDrafts(prev => ({ ...prev, [m.id]: { home_score: prev[m.id]?.home_score ?? "", away_score: prev[m.id]?.away_score ?? "", home_penalty_goals: prev[m.id]?.home_penalty_goals ?? "0", away_penalty_goals: e.target.value } }))} />
                          <button type="button" disabled={busy} onClick={() => void finishMatch(m.id)}>Сохранить</button>
                        </div>
                      : <span style={{ opacity: .65, whiteSpace: "nowrap" }}>Ожидается</span>}</td>
                </tr>)}</tbody>
              </table></div>
            </details>;
          });
        })()}

        <details style={{ marginTop: 16 }}><summary style={{ cursor: "pointer", fontWeight: 700, padding: "10px 0" }}>Дополнительные действия администратора</summary>
        {(() => {
          const current = adminData.stages.find(s => s.is_current);
          if (!current) return <p>Текущий этап не назначен.</p>;
          const finished = current.finished_count;
          const ready = current.match_count === 56 && finished === 56;
          return <details style={{margin:"12px 0"}}><summary style={{cursor:"pointer",fontWeight:700,padding:"8px 0"}}>
            Закрытие этапа · {current.name} · {finished} / 56 завершено
          </summary>
            <p>Закрытие доступно после завершения 56 матчей и проверки всех начислений сервером.</p>
            <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end"}}>
              <label>Следующий этап <select value={nextStageChoice} onChange={e=>setNextStageChoice(e.target.value)}>
                <option value="">Выбери следующий этап</option>
                {adminData.stages.filter(s=>s.status==="draft" && s.id!==current.id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
              </select></label>
              <button type="button" disabled={!ready || !nextStageChoice || !adminWritesEnabled || busy} onClick={()=>void closeCurrentStage()}>
                Закрыть этап и назначить следующий
              </button>
            </div>
            {!ready && <p>Закрытие заблокировано: {current.match_count} матчей, завершено {finished} из 56.</p>}
          </details>;
        })()}

        <details style={{margin:"10px 0"}}><summary style={{cursor:"pointer",fontWeight:650,padding:"8px 0"}}>Участники · сброс пароля</summary>
        <h2>Сброс пароля участника</h2>
        <form onSubmit={resetParticipantPassword} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 24 }}>
          <label>Участник <select required value={resetUsername} onChange={e => { setResetUsername(e.target.value); setResetCompletedFor(""); }}>
            <option value="">Выбери участника</option>
            {participants.filter(name => name.toUpperCase() !== "ADMIN").map(name => <option key={name} value={name}>{name}</option>)}
          </select></label>
          <button type="submit" disabled={busy || !resetUsername}>Сбросить пароль на стандартный</button>
        </form>
        {resetCompletedFor && <div className="card" style={{ padding: 14, marginBottom: 24 }} role="status">
          <p>Пароль участника <strong>{resetCompletedFor}</strong> сброшен на <code>12345678</code>. При следующем входе потребуется его заменить.</p>
        </div>}
        </details>
        <details style={{margin:"10px 0"}}>
          <summary style={{cursor:"pointer",fontWeight:650,padding:"8px 0"}}>Прогнозы · внести за участника</summary>
          <p>Прогноз, переданный по телефону или сообщением, можно записать до окончания приёма. После начала матча или начисления очков запись запрещена.</p>
          <form onSubmit={saveDelegatedPrediction} style={{display:"grid",gap:10,maxWidth:570,marginBottom:16}}>
            <label>Участник <select required value={delegatedForm.username}
              onChange={e=>setDelegatedForm(prev=>({...prev,username:e.target.value,match_id:"",home_pred:"",away_pred:""}))}>
              <option value="">Выбери участника</option>
              {participants.filter(x=>x.toUpperCase()!=="ADMIN").map(x=><option key={x} value={x}>{x}</option>)}
            </select></label>
            <label>Матч текущего этапа <select required value={delegatedForm.match_id}
              onChange={e=>setDelegatedForm(prev=>({...prev,match_id:e.target.value,home_pred:"",away_pred:""}))}>
              <option value="">Выбери матч</option>
              {adminData.matches.filter(m=>(adminStageChoice==="current" || adminStageChoice===adminData.stages.find(x=>x.is_current)?.id) &&
                m.status==="scheduled" && matchTime(m.deadline_at)>Date.now() &&
                matchTime(m.kickoff_at)>Date.now()).map(m=>
                <option key={m.id} value={m.id}>{m.home_team} — {m.away_team} · {new Date(m.kickoff_at ?? "").toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})} МСК</option>)}
            </select></label>
            {delegatedForm.username && delegatedForm.match_id && adminData.delegated_predictions?.some(
              p=>p.match_id===delegatedForm.match_id && p.username===delegatedForm.username) &&
              <p>Участник уже делал прогноз на этот матч. Сохранение заменит его, пока приём открыт.</p>}
            <div style={{display:"flex",gap:8,alignItems:"end",flexWrap:"wrap"}}>
              <label>Голы хозяев <input aria-label="Прогноз хозяев" required type="number" min="0" max="99" style={{width:80}}
                value={delegatedForm.home_pred} onChange={e=>setDelegatedForm(prev=>({...prev,home_pred:e.target.value}))}/></label>
              <span>:</span>
              <label>Голы гостей <input aria-label="Прогноз гостей" required type="number" min="0" max="99" style={{width:80}}
                value={delegatedForm.away_pred} onChange={e=>setDelegatedForm(prev=>({...prev,away_pred:e.target.value}))}/></label>
            </div>
            <label>Как получен прогноз <input required minLength={3} maxLength={160}
              placeholder="Например: сообщение в чате клуба"
              value={delegatedForm.source_note} onChange={e=>setDelegatedForm(prev=>({...prev,source_note:e.target.value}))}/></label>
            {!adminData.prediction_writes_enabled && <p>Приём прогнозов сейчас отключён. Ввод за участников недоступен.</p>}
            <button disabled={busy || !adminWritesEnabled || !adminData.prediction_writes_enabled || !delegatedForm.username || !delegatedForm.match_id}
              type="submit">Сохранить прогноз за участника</button>
            <small>Действие фиксируется в журнале. Не вводи сюда пароли или другие личные данные.</small>
          </form>
        </details>
        <details style={{margin:"10px 0"}}><summary style={{cursor:"pointer",fontWeight:650,padding:"8px 0"}}>Туры и этапы · создать и переименовать</summary>
        <label>Действие <select value={["create-stage","tour","rename-stage","rename-tour"].includes(adminAction)?adminAction:""} onChange={e=>setAdminAction(e.target.value)}>
          <option value="">Выбери действие</option>
          <option value="create-stage">Создать этап</option>
          <option value="tour">Создать тур</option>
          <option value="rename-stage">Переименовать этап</option>
          <option value="rename-tour">Переименовать тур</option>
        </select></label>
        {adminAction === "create-stage" && <>
          <h2>Новый этап</h2>
          <p>Создаётся пустой черновой этап на 56 матчей. Текущий этап и результаты не меняются.</p>
          <form onSubmit={createStage} style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"end",marginBottom:16}}>
            <label>Название <input required maxLength={160} value={newStageName}
              onChange={e=>setNewStageName(e.target.value)} placeholder="Этап 4 ЧР 26-27"/></label>
            <button type="submit" disabled={busy || !adminWritesEnabled || !newStageName.trim()}>Создать этап</button>
          </form>
        </>}
        {adminAction === "tour" && <><h2>Новый тур в существующем этапе</h2>
        <form onSubmit={createTour} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 24 }}>
          <label>Этап <select required value={tourForm.stage_id}
            onChange={e => setTourForm(prev => ({ ...prev, stage_id: e.target.value }))}>
            <option value="">Выбери этап</option>
            {adminData.stages.filter(s => s.status==="draft").map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label>Номер тура <input required type="number" min="1" max="999"
            value={tourForm.tour_no} onChange={e => setTourForm(prev => ({ ...prev, tour_no: e.target.value }))} /></label>
          <label>Название тура <input maxLength={160} value={tourForm.name}
            onChange={e => setTourForm(prev => ({ ...prev, name: e.target.value }))} placeholder="Тур 31" /></label>
          <button type="submit" disabled={busy || !adminWritesEnabled}>Создать тур</button>
        </form>
        </>}
        {adminAction === "rename-stage" && <><h2>Переименование этапа</h2>
        <p>Доступно только для пустого чернового этапа, без туров и матчей.</p>
        <form onSubmit={renameStage} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 24 }}>
          <label>Этап <select required value={renameStageForm.stage_id}
            onChange={e => {
              const stage = adminData.stages.find(s => s.id === e.target.value);
              setRenameStageForm({ stage_id: e.target.value, name: stage?.name ?? "" });
            }}>
            <option value="">Выбери этап</option>
            {adminData.stages.filter(s => s.status==="draft").map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          <label>Новое название <input required maxLength={160} value={renameStageForm.name}
            onChange={e => setRenameStageForm(prev => ({ ...prev, name: e.target.value }))} /></label>
          <button type="submit" disabled={busy || !adminWritesEnabled || !renameStageForm.stage_id}>Переименовать этап</button>
        </form>
        </>}
        {adminAction === "rename-tour" && <><h2>Переименование тура</h2>
        <p>Переименовать можно только тур, в котором ещё нет матчей. Исторические туры защищены.</p>
        <form onSubmit={renameTour} style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "end", marginBottom: 24 }}>
          <label>Тур <select required value={renameTourForm.tour_id}
            onChange={e => {
              const tour = adminData.tours.find(t => t.id === e.target.value);
              setRenameTourForm({ tour_id: e.target.value, name: tour?.name ?? "" });
            }}>
            <option value="">Выбери тур</option>
            {adminData.tours.filter(t => adminData.stages.some(stage=>stage.id===t.stage_id && stage.status==="draft")).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
          <label>Новое название <input required maxLength={160} value={renameTourForm.name}
            onChange={e => setRenameTourForm(prev => ({ ...prev, name: e.target.value }))} /></label>
          <button type="submit" disabled={busy || !adminWritesEnabled || !renameTourForm.tour_id}>Переименовать тур</button>
        </form>
        </>}
        </details>
        <details style={{margin:"10px 0"}}><summary style={{cursor:"pointer",fontWeight:650,padding:"8px 0"}}>Матчи · создать или изменить команды</summary>
        <label>Действие <select value={["create-match","edit-teams"].includes(adminAction)?adminAction:""} onChange={e=>setAdminAction(e.target.value)}>
          <option value="">Выбери действие</option>
          <option value="create-match">Создать матч</option>
          <option value="edit-teams">Изменить команды</option>
        </select></label>
        {adminAction === "create-match" && <><h2>Создание матча</h2>
        <form onSubmit={createMatch} style={{ display: "grid", gap: 10 }}>
          {(["tournament_id", "stage_id", "tour_id", "home_team_id", "away_team_id"] as const).map(field => {
            const options = field === "tournament_id" ? adminData.tournaments :
              field === "stage_id" ? adminData.stages.filter(s=>s.status==="draft") : field === "tour_id" ?
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
          <label>Начало матча (МСК) <input required type="datetime-local" value={adminForm.kickoff_at}
            onChange={e => setAdminForm(prev => ({ ...prev, kickoff_at: e.target.value }))} /></label>
          <label>Окончание приёма прогнозов (МСК) <input required type="datetime-local" value={adminForm.deadline_at}
            onChange={e => setAdminForm(prev => ({ ...prev, deadline_at: e.target.value }))} /></label>
          <button disabled={busy || !adminWritesEnabled} type="submit">Создать матч</button>
          {!adminWritesEnabled && <p>Создание матчей временно недоступно.</p>}
        </form>
        </>}
        {adminAction === "edit-teams" && <><h2>Изменение команд матча</h2>
        <p>Команды можно исправить только до появления первого прогноза и окончания срока его подачи.</p>
        <form onSubmit={editMatchTeams} style={{ display: "grid", gap: 10, marginBottom: 24 }}>
          <label>Матч <select required value={teamsEditForm.match_id}
            onChange={e => {
              const match = adminData.matches.find(m => m.id === e.target.value);
              setTeamsEditForm({ match_id: e.target.value, home_team_id: match?.home_team_id ?? "",
                away_team_id: match?.away_team_id ?? "" });
            }}>
            <option value="">Выбери новый матч</option>
            {adminData.matches.filter(m => m.status === "scheduled" && matchTime(m.deadline_at) > Date.now()).map(m =>
              <option key={m.id} value={m.id}>{m.home_team} — {m.away_team}</option>)}
          </select></label>
          <label>Хозяева <select required value={teamsEditForm.home_team_id}
            onChange={e => setTeamsEditForm(prev => ({ ...prev, home_team_id: e.target.value }))}>
            <option value="">Выбери команду</option>
            {adminData.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
          <label>Гости <select required value={teamsEditForm.away_team_id}
            onChange={e => setTeamsEditForm(prev => ({ ...prev, away_team_id: e.target.value }))}>
            <option value="">Выбери команду</option>
            {adminData.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
          <button type="submit" disabled={busy || !adminWritesEnabled || !teamsEditForm.match_id}>Сохранить команды</button>
        </form>
        </>}
        </details>
        </details>
      </section>}
      {activeTab === "ranking" && <section className="cutover-content cutover-rankings">
        <div className="cutover-section-heading"><div><span>ТЕКУЩИЙ ЭТАП — <span className="cutover-stage-title">{currentTable?.stage?.name ?? "Загрузка…"}</span></span><h2>Текущая таблица</h2></div></div>
        {tableLoading && <p>Загружаем матчи и начисления…</p>}
        {!tableLoading && !currentTable && <p>Не удалось загрузить текущую таблицу.</p>}
        {currentTable && !currentTable.stage && <p>Текущий этап не выбран.</p>}
        {currentTable?.stage && <>
          <label className="cutover-table-filter">Тур <select value={selectedTour} onChange={e => setSelectedTour(e.target.value)}>
            <option value="all">Все туры</option>
            {[...currentTable.tours].sort((a,b)=>Number(a.tour_no)-Number(b.tour_no)||Number(a.id)-Number(b.id)).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select></label>
          {[...currentTable.tours].sort((a,b)=>Number(a.tour_no)-Number(b.tour_no)||Number(a.id)-Number(b.id)).filter(t => selectedTour === "all" || t.id === selectedTour).map(t => {
            const grouped = new Map<string, typeof currentTable.rows>();
            for (const record of currentTable.rows.filter(row => row.tour_id === t.id)) {
              grouped.set(record.match_id, [...(grouped.get(record.match_id) ?? []), record]);
            }
            return <div className="cutover-current-tour" key={t.id}>
              <h3>{t.name}</h3>
              <div className="tableWrap"><table className="table currentTable">
                <thead><tr><th>№</th><th>Матч</th><th>Результат</th>
                  {[...currentTable.users].sort((a,b) => { const rank=(name:string)=>["АМН","БАА","КДЛ","КЕН","СВС"].indexOf(name.toUpperCase()); const ra=rank(a.username),rb=rank(b.username); return (ra<0?999:ra)-(rb<0?999:rb) || a.username.localeCompare(b.username,"ru"); }).map((u,index) => <th key={u.id} className="ctUserHead">
                    <div>{(() => { const ranked=[...currentTable.users].sort((a,b)=>currentTable.rows.filter(r=>r.user_id===b.id).reduce((n,r)=>n+Number(r.points??0),0)-currentTable.rows.filter(r=>r.user_id===a.id).reduce((n,r)=>n+Number(r.points??0),0)||a.username.localeCompare(b.username,"ru")); const rank=ranked.findIndex(p=>p.id===u.id); return rank===0?"🥇":rank===1?"🥈":rank===2?"🥉":""; })()} {u.username}</div>
                    <div className="ctTotal">({Number(currentTable.rows.filter(row=>row.user_id===u.id).reduce((sum,row)=>sum+Number(row.points??0),0).toFixed(2))})</div>
                  </th>)}
                </tr></thead>
                <tbody>{[...grouped.entries()].map(([id, records], index) => {
                  const m = records[0];
                  return <tr key={id}>
                    <td>{m.stage_match_no ?? index + 1}</td>
                    <td><strong>{m.home_team} — {m.away_team}</strong><CompetitionBadge label={m.competition_label} /></td>
                    <td>{m.home_score == null || m.away_score == null ? "—" : m.home_score + ":" + m.away_score}</td>
                    {[...currentTable.users].sort((a,b) => { const rank=(name:string)=>["АМН","БАА","КДЛ","КЕН","СВС"].indexOf(name.toUpperCase()); const ra=rank(a.username),rb=rank(b.username); return (ra<0?999:ra)-(rb<0?999:rb) || a.username.localeCompare(b.username,"ru"); }).map(u => {
                      const prediction = records.find(row => row.user_id === u.id);
                      const score = prediction?.home_pred == null || prediction.away_pred == null ? "—" : prediction.home_pred + ":" + prediction.away_pred;
                      return <td key={u.id}><span className="predText">{score}</span>
                        {prediction?.points != null && <PointsPopover pts={Number(prediction.points)} breakdown={{
                          total:Number(prediction.points),
                          predText:score,
                          resText:m.home_score == null || m.away_score == null ? "—" : m.home_score+":"+m.away_score,
                          homeGoalsPts:Number(prediction.points_h1 ?? 0),
                          awayGoalsPts:Number(prediction.points_h2 ?? 0),
                          homeGoalsPred:prediction.home_pred, awayGoalsPred:prediction.away_pred,
                          homeGoalsRes:m.home_score,awayGoalsRes:m.away_score,
                          outcomeTotal:Number(prediction.points_outcome ?? 0),
                          outcomeBase:Number(prediction.points_outcome_base ?? 0),
                          outcomeMultBonus:Number(prediction.points_outcome_bonus ?? 0),
                          diffTotal:Number(prediction.points_diff ?? 0),
                          diffBase:Number(prediction.points_diff_base ?? 0),
                          diffMultBonus:Number(prediction.points_diff_bonus ?? 0),
                          nearMissPts:Number(prediction.points_bonus ?? 0),
                        }} />}
                      </td>;
                    })}
                  </tr>;
                })}</tbody>
              </table></div>
            </div>;
          })}
        </>}
      </section>}
      {activeTab === "golden-whistle" && <section className="cutover-content cutover-awards"><div className="cutover-section-heading"><div><span>СПЕЦИАЛЬНАЯ НОМИНАЦИЯ</span><h2>Золотой свисток <span aria-hidden="true">🏆</span></h2></div><p>За решающие пенальти</p></div>
        {whistleUnavailable && <p>Номинация пока недоступна на этой площадке.</p>}
        {whistle?.stage && <><p><strong>Текущий этап: {whistle.stage.name}</strong></p>
          <p>Матчей с забитыми пенальти: {whistle.penalty_matches}{whistleLoading ? " · загрузка..." : ""}</p>
          <p>Отдельная номинация: учитываются очки, которые помогли набрать результативные пенальти. В общий рейтинг эти очки повторно не добавляются.</p>
          <div className="tableWrap"><table className="table" style={{ minWidth: 450 }}>
            <thead><tr><th>Место</th><th>Участник</th><th>Баллы</th><th>Место в основном конкурсе</th></tr></thead>
            <tbody>{whistle.leaderboard.map((p, index) => <tr key={p.username}>
              <td>{index + 1} {index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : ""}</td>
              <td>{p.username}</td><td>{Number(p.points).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}<details className="cutover-whistle-details"><summary>Расшифровка ({(p.breakdown??[]).length} матчей)</summary>
                    {(p.breakdown??[]).length ? <div className="tableWrap"><button type="button" className="cutover-whistle-close" onClick={e=>e.currentTarget.closest("details")?.removeAttribute("open")}>Закрыть ×</button><table className="table">
                    <thead><tr><th>Матч</th><th>Прогноз</th><th>Без пен.</th><th>Итог</th><th>База −</th><th>База +</th><th>Очки</th></tr></thead>
                    <tbody>{(p.breakdown??[]).map(m=><tr key={m.match_id}><td>{m.match}</td><td>{m.prediction}</td><td>{m.without_penalties}</td><td>{m.result}</td><td>{m.without_penalties_base}</td><td>{m.with_penalties_base}</td><td><strong>{Number(m.points.toFixed(2)).toLocaleString("ru-RU")}</strong></td></tr>)}</tbody></table></div> : <p>Нет положительных начислений за пенальти.</p>}
                    </details></td><td>{p.main_place}</td>
            </tr>)}</tbody>
          </table></div></>}
      </section>}
      {activeTab === "grand-prix" && <section className="cutover-content cutover-grand-prix"><div className="cutover-section-heading"><div><span>СЕЗОННЫЙ ЗАЧЁТ</span><h2>Гран-при <span aria-hidden="true">🏁</span></h2></div><p>Очки за этапы соревнования</p></div>
        {grandPrixLoading && <p>Обновляем сезонный зачёт…</p>}
        {grandPrixUnavailable && <p>Рейтинг Гран-при временно недоступен.</p>}
        {grandPrix?.seasons.map(season => <div key={season.id}>
          <h3>{season.name}</h3>
          <div className="tableWrap"><table className="table" style={{ minWidth: 450 }}>
            <thead><tr><th>Участник</th><th>Очки</th><th>Этапов с очками</th></tr></thead>
            <tbody>{grandPrix.ratings.filter(p => p.season_id === season.id).map((p, index) =>
              <tr key={p.username} className={p.username === sessionUsername ? "cutover-grand-prix-me" : undefined}>
                <td>{index === 0 ? "🥇 " : index === 1 ? "🥈 " : index === 2 ? "🥉 " : ""}{p.username}{p.username === sessionUsername && <span className="cutover-grand-prix-self-label"> · ты</span>}</td>
                <td>{p.points}</td><td>{p.scored_rounds}</td>
              </tr>)}</tbody>
          </table></div>
        </div>)}
      </section>}
      {activeTab === "schedule" && <section className="cutover-content"><div className="cutover-section-heading"><div><span>ИГРОВОЙ КАЛЕНДАРЬ</span><h2>Расписание матчей <em>{schedule.length}</em></h2></div><p>Каждый прогноз имеет значение</p></div>
      <p>{writesEnabled ? "Прогнозы можно менять до дедлайна." : "Сохранение новых прогнозов пока отключено."}</p>
      {schedule.some(m => isProvisionalSpringKickoff(m.match_id, m.kickoff_at)) && <p>Для матчей туров 18–21 дата и время предварительные. Время 12:00 МСК — техническое, а не подтверждённое начало матча; пока оно также является сроком закрытия прогнозов. Точное расписание будет внесено после утверждения.</p>}
      <div className="cutover-filters">
        <button type="button" aria-pressed={matchFilter === "upcoming"} onClick={() => { setMatchFilter("upcoming"); setShowAllMatches(false); }} className={matchFilter === "upcoming" ? "cutover-filter active" : "cutover-filter"}>Предстоящие</button>
        <button type="button" aria-pressed={matchFilter === "all"} onClick={() => { setMatchFilter("all"); setShowAllMatches(false); }} className={matchFilter === "all" ? "cutover-filter active" : "cutover-filter"}>Все матчи</button>
      </div>
      {scheduleSelection.length > 30 && <button type="button" onClick={() => setShowAllMatches(v => !v)} style={{ margin: "12px 0", padding: "10px 14px", borderRadius: 10 }}>{showAllMatches ? "Показать первые 30" : "Показать больше матчей"}</button>}
      <div className="tableWrap cutover-match-table"><table className="table">
        <thead><tr><th>Дата</th><th>Матч</th><th>Прогноз</th><th>Результат</th>{writesEnabled && <th>Изменить прогноз</th>}</tr></thead>
        <tbody>{displayedSchedule.map(m => <tr key={m.match_id}>
          <td>{m.kickoff_at ? new Date(m.kickoff_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : pendingKickoffLabel(m.pending_kickoff_date)}{isProvisionalSpringKickoff(m.match_id, m.kickoff_at) && <small style={{display:"block",opacity:.75}}>Предварительно · 12:00 МСК (техническое)</small>}</td>
          <td><div className="cutover-match-teams"><strong>{m.home_team || "?"}</strong><span>—</span><strong>{m.away_team || "?"}</strong></div><CompetitionBadge label={m.competition_label} /></td>
          <td><span className={m.home_pred !== null && m.away_pred !== null ? "cutover-score has-prediction" : "cutover-score"}>{m.home_pred ?? "—"} : {m.away_pred ?? "—"}</span></td>
          <td><span className="cutover-score">{m.home_score ?? "—"} : {m.away_score ?? "—"}</span></td>
          {writesEnabled && <td>{m.predictions_open ? <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, minWidth: 210 }}>
            <input aria-label="Голы хозяев" type="number" min="0" max="99" style={{ width: 62, minHeight: 38, padding: 6, fontSize: 16, borderRadius: 8, border: "1px solid #94a3b8" }}
              value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).home}
              onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: e.target.value, away: (prev[m.match_id]?.away ?? String(m.away_pred ?? "")) } }))} />
            :
            <input aria-label="Голы гостей" type="number" min="0" max="99" style={{ width: 52 }}
              value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).away}
              onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: (prev[m.match_id]?.home ?? String(m.home_pred ?? "")), away: e.target.value } }))} />
            <button type="button" disabled={busy} onClick={() => void savePrediction(m)} className="cutover-save">{savedMatchId === m.match_id ? "✓ Сохранено" : "Сохранить"}</button>
          </div> : "Закрыто"}</td>}
        </tr>)}</tbody>
      </table></div>
      <div className="cutover-mobile-match-list" aria-label="Матчи — мобильный вид">
        {displayedSchedule.map(m => <article className="cutover-mobile-match" key={m.match_id}>
          <div className="cutover-mobile-date">{m.kickoff_at ? new Date(m.kickoff_at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : pendingKickoffLabel(m.pending_kickoff_date)}{isProvisionalSpringKickoff(m.match_id, m.kickoff_at) && <small style={{display:"block"}}>Предварительно · время техническое</small>}</div>
          <div className="cutover-mobile-teams"><strong>{m.home_team || "?"}</strong><span>—</span><strong>{m.away_team || "?"}</strong></div><CompetitionBadge label={m.competition_label} />
          <div className="cutover-mobile-scoreline">
            <div><span>Мой прогноз</span><strong>{m.home_pred ?? "—"} : {m.away_pred ?? "—"}</strong></div>
            <div><span>Результат</span><strong>{m.home_score ?? "—"} : {m.away_score ?? "—"}</strong></div>
          </div>
          {writesEnabled && (m.predictions_open ? <div className="cutover-mobile-editor">
            <span className="cutover-mobile-field-label">Изменить прогноз</span>
            <div className="cutover-mobile-edit-controls">
              <input aria-label={`Голы хозяев: ${m.home_team || "команда"}`} inputMode="numeric" type="number" min="0" max="99"
                value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).home}
                onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: e.target.value, away: (prev[m.match_id]?.away ?? String(m.away_pred ?? "")) } }))} />
              <span aria-hidden="true">:</span>
              <input aria-label={`Голы гостей: ${m.away_team || "команда"}`} inputMode="numeric" type="number" min="0" max="99"
                value={(drafts[m.match_id] ?? { home: String(m.home_pred ?? ""), away: String(m.away_pred ?? "") }).away}
                onChange={e => setDrafts(prev => ({ ...prev, [m.match_id]: { home: (prev[m.match_id]?.home ?? String(m.home_pred ?? "")), away: e.target.value } }))} />
              <button type="button" disabled={busy} onClick={() => void savePrediction(m)} className="cutover-save">{savedMatchId === m.match_id ? "✓ Сохранено" : "Сохранить"}</button>
            </div>
          </div> : <div className="cutover-mobile-closed">Приём прогнозов закрыт</div>)}
        </article>)}
      </div>
      </section>}
      {activeTab === "analytics" && <section className="cutover-content">
        <div className="cutover-section-heading"><div><h2>Аналитика прогнозов</h2></div></div>
        {!currentTable?.stage ? <p>Загружаем статистику этапа…</p> : (() => {
          const users=[...currentTable.users].sort((a,b)=>a.username.localeCompare(b.username,"ru"));
          const tours=[...currentTable.tours].sort((a,b)=>Number(a.tour_no)-Number(b.tour_no));
          const rankFor=(userId:string,cutoff:number)=>{
            const ranking=users.map(u=>({id:u.id,username:u.username,points:currentTable.rows
              .filter(p=>p.user_id===u.id&&tours.some(t=>t.id===p.tour_id&&Number(t.tour_no)<=cutoff))
              .reduce((sum,p)=>sum+Number(p.points??0),0)}))
              .sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username,"ru"));
            return ranking.findIndex(u=>u.id===userId)+1;
          };
          return <>
            <h3>Гонка за лидерство — динамика по турам</h3>
            <p>Первый график показывает отставание от лидера после каждого тура: линия на нуле означает первое место, ниже — сколько очков не хватает до лидера. Можно переключиться на накопленные очки. Второй график показывает изменение мест. Учитываются только матчи с начисленными очками.</p>
            {(() => {
              const finishedTours=tours.filter(t=>currentTable.rows.some(p=>p.tour_id===t.id&&p.points!==null));
              const cumulative=users.map(u=>({username:u.username,id:u.id,values:finishedTours.map(t=>
                currentTable.rows.filter(p=>p.user_id===u.id&&tours.some(k=>k.id===p.tour_id&&Number(k.tour_no)<=Number(t.tour_no)))
                  .reduce((sum,p)=>sum+Number(p.points??0),0))}));
              const ranking=users.map(u=>({username:u.username,id:u.id,values:finishedTours.map(t=>rankFor(u.id,Number(t.tour_no)))}));
              const palette=["#166534","#1d4ed8","#c2410c","#7c3aed","#be185d"];
              const gaps=cumulative.map(u=>({...u,values:u.values.map((points,index)=>
                Number((points-Math.max(...cumulative.map(other=>other.values[index]??0))).toFixed(2)))}));
              const graph=(series:typeof cumulative,mode:"points"|"rank"|"gap")=>{
                const numbers=series.flatMap(row=>row.values);
                const max=mode==="rank"?users.length:mode==="gap"?0:Math.max(1,...numbers);
                const min=mode==="rank"?1:mode==="gap"?Math.min(-1,...numbers):Math.min(...numbers,0);
                const range=Math.max(1,max-min);
                const x=(i:number)=>70+i*(660/Math.max(1,finishedTours.length-1));
                const y=(n:number)=>42+(mode==="rank"?(n-min)/range:(max-n)/range)*205;
                return <div className="cutover-chart-scroll"><svg className="cutover-analytics-chart" viewBox="0 0 800 306" role="img" aria-label={mode==="rank"?"Изменение места участников по турам":mode==="gap"?"Отставание участников от лидера по турам":"Накопленные очки участников по турам"}>
                  {[0,1,2,3,4].map(i=><g key={i}><line x1="70" y1={42+i*205/4} x2="730" y2={42+i*205/4} stroke="#dbe5e0" />
                    <text x="61" y={46+i*205/4} fontSize="12" fill="#586e65" textAnchor="end">{mode==="rank"?Math.round(1+i*(max-1)/4):Number((max-i*range/4).toFixed(1))}</text></g>)}
                  {finishedTours.map((t,i)=><text key={t.id} x={x(i)} y="268" fontSize="12" textAnchor="middle" fill="#3d5e51">{t.tour_no}</text>)}
                  {series.map((line,i)=><g key={line.id}><polyline fill="none" stroke={palette[i%palette.length]} strokeWidth="2.8"
                    points={line.values.map((v,j)=>x(j)+","+y(v)).join(" ")}/>
                    {line.values.map((v,j)=><circle key={j} cx={x(j)} cy={y(v)} r="4.5" fill={palette[i%palette.length]}>
                      <title>{line.username} · Тур {finishedTours[j].tour_no}: {mode==="rank"?"место "+v:mode==="gap"?(v===0?"лидер":v+" очков от лидера"):v+" очков"}</title>
                    </circle>)}</g>)}
                  <text x="400" y="299" fontSize="12" fill="#586e65" textAnchor="middle">Номер тура</text>
                </svg></div>;
              };
              return finishedTours.length ? <>
                <h4>{analyticsGraphMode==="gap"?"Отставание от лидера":"Накопленные очки"}</h4>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
                  <button type="button" aria-pressed={analyticsGraphMode==="gap"} onClick={()=>setAnalyticsGraphMode("gap")}>Отставание от лидера</button>
                  <button type="button" aria-pressed={analyticsGraphMode==="points"} onClick={()=>setAnalyticsGraphMode("points")}>Всего очков</button>
                </div>
                {graph(analyticsGraphMode==="gap"?gaps:cumulative,analyticsGraphMode)}
                <h4>Место в рейтинге</h4>{graph(ranking,"rank")}
                <div className="cutover-chart-legend">{users.map((u,i)=><span key={u.id}><i style={{background:palette[i%palette.length]}}/>{u.username}</span>)}</div>
                <p>Место на графике определяется набранными очками. При равенстве очков участники временно упорядочены по имени — это не дополнительное правило определения победителя.</p>
              </> : <p>Завершённых туров с начислениями пока нет.</p>;
            })()}
            <AnalyticsInsights users={currentTable.users} rows={currentTable.rows} viewer={sessionUsername}/>
          </>;
        })()}
      </section>}
      {activeTab === "golden-boot" && <section className="cutover-content cutover-awards">
        <div className="cutover-section-heading"><div><span>СПЕЦИАЛЬНАЯ НОМИНАЦИЯ</span><h2>Золотая бутса <span aria-hidden="true">⚽</span></h2></div><p>За точно угаданные счета</p></div>
        <p><strong>Текущий этап: {currentTable?.stage?.name ?? "Загрузка…"}</strong></p>
        <p>Отдельная номинация: учитываются только точные счета матчей текущего этапа. Набранные за матч очки повторно не добавляются в основной рейтинг.</p>
        {boot.length === 0 ? <p>Точных прогнозов в текущем этапе пока нет.</p> :
          <div className="tableWrap"><table className="table" style={{minWidth:450}}>
            <thead><tr><th>Место</th><th>Участник</th><th>Точных счетов</th><th>Место в основном конкурсе</th></tr></thead>
            <tbody>{boot.map((p,i)=>{
              const rank=stageTotals.findIndex(u=>u.username===p.username);
              return <tr key={p.username}>
                <td>{i+1} {i===0?"🥇":i===1?"🥈":i===2?"🥉":""}</td>
                <td>{p.username}</td><td>{p.exact}</td><td>{rank>=0?rank+1:"—"}</td>
              </tr>;
            })}</tbody>
          </table></div>}
      </section>}
      {activeTab === "archive" && <section className="cutover-content">
        <div className="cutover-section-heading"><div><span>ЗАВЕРШЁННЫЕ ЭТАПЫ</span><h2>Архив соревнований</h2></div><p>Результаты этапа и победители специальных номинаций</p></div>
        {archiveLoading && <p>Загружаем архив…</p>}
        {!archiveLoading && !archive && <p>Не удалось загрузить архив.</p>}
        {archive && <>
          <label className="cutover-table-filter">Этап <select value={archive.stage?.id??""} onChange={e=>{setArchiveStageId(e.target.value);setArchiveWhistle(null);}}>
            {archive.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select></label>
          {archive.stage && (() => {
            const totals=archive.users.map(u=>({ ...u,points:archive.rows.filter(row=>row.user_id===u.id).reduce((sum,row)=>sum+Number(row.points??0),0)}))
              .sort((a,b)=>b.points-a.points||a.username.localeCompare(b.username,"ru"));
            const boots=archive.users.map(u=>({username:u.username,exact:archive.rows.filter(row=>row.user_id===u.id&&row.home_pred!==null&&row.away_pred!==null&&row.home_score!==null&&row.away_score!==null&&row.home_pred===row.home_score&&row.away_pred===row.away_score).length}))
              .sort((a,b)=>b.exact-a.exact||a.username.localeCompare(b.username,"ru"));
            const ordered=[...archive.users].sort((a,b)=>{const order=["АМН","БАА","КДЛ","КЕН","СВС"];const ai=order.indexOf(a.username.toUpperCase()),bi=order.indexOf(b.username.toUpperCase());return (ai<0?99:ai)-(bi<0?99:bi)||a.username.localeCompare(b.username,"ru");});
            return <>
              <h3>Итоговая таблица — {archive.stage.name}</h3>
              <div className="tableWrap"><table className="table"><thead><tr><th>Место</th><th>Участник</th><th>Очки</th></tr></thead>
                <tbody>{totals.map((u,i)=><tr key={u.id}><td>{i+1} {i===0?"🥇":i===1?"🥈":i===2?"🥉":""}</td><td>{u.username}</td><td>{Number(u.points.toFixed(2)).toLocaleString("ru-RU")}</td></tr>)}</tbody>
              </table></div>
              <details className="cutover-archive-summary"><summary>Матчи и прогнозы по турам ({archive.tours.length})</summary>
              {[...archive.tours].sort((a,b)=>Number(b.tour_no)-Number(a.tour_no)).map(t=>{
                const matches=new Map<string,typeof archive.rows>();
                for(const row of archive.rows.filter(r=>r.tour_id===t.id))matches.set(row.match_id,[...(matches.get(row.match_id)??[]),row]);
                return <div className="cutover-current-tour" key={t.id}><h3>{t.name}</h3>
                  <div className="tableWrap"><table className="table currentTable"><thead><tr><th>№</th><th>Матч</th><th>Результат</th>{ordered.map(u=><th key={u.id}>{u.username}</th>)}</tr></thead>
                    <tbody>{[...matches.entries()].map(([mid,rows],i)=>{
                      const m=rows[0];return <tr key={mid}><td>{m.stage_match_no??i+1}</td><td><strong>{m.home_team} — {m.away_team}</strong></td>
                      <td>{m.home_score==null||m.away_score==null?"—":m.home_score+":"+m.away_score}</td>
                      {ordered.map(u=>{const p=rows.find(r=>r.user_id===u.id);return <td key={u.id}>{p?.home_pred==null||p.away_pred==null?"—":p.home_pred+":"+p.away_pred}{p?.points==null?"":` (${Number(p.points).toLocaleString("ru-RU")})`}</td>;})}
                      </tr>;
                    })}</tbody></table></div></div>;
              })}
              </details>
              <div className="cutover-awards"><h3>Специальная номинация — Золотая бутса ⚽</h3>
                <div className="tableWrap"><table className="table"><thead><tr><th>Место</th><th>Участник</th><th>Точных счетов</th></tr></thead>
                <tbody>{boots.map((u,i)=><tr key={u.username}><td>{i+1} {i===0?"🥇":i===1?"🥈":i===2?"🥉":""}</td><td>{u.username}</td><td>{u.exact}</td></tr>)}</tbody></table></div>
                <h3>Специальная номинация — Золотой свисток 🏆</h3>
                {archiveWhistleError?<p role="status">Не удалось получить результаты Золотого свистка для этого этапа.</p>:!archiveWhistle?<p>Загрузка результатов номинации…</p>:<div className="tableWrap"><table className="table"><thead><tr><th>Место</th><th>Участник</th><th>Баллы</th></tr></thead>
                <tbody>{archiveWhistle.leaderboard.map((u,i)=><tr key={u.username}><td>{i+1} {i===0?"🥇":i===1?"🥈":i===2?"🥉":""}</td><td>{u.username}</td><td>{Number(u.points).toLocaleString("ru-RU")}<details className="cutover-whistle-details"><summary>Расшифровка ({(u.breakdown??[]).length} матчей)</summary>
                    {(u.breakdown??[]).length ? <div className="tableWrap"><button type="button" className="cutover-whistle-close" onClick={e=>e.currentTarget.closest("details")?.removeAttribute("open")}>Закрыть ×</button><table className="table">
                    <thead><tr><th>Матч</th><th>Прогноз</th><th>Без пен.</th><th>Итог</th><th>База −</th><th>База +</th><th>Очки</th></tr></thead>
                    <tbody>{(u.breakdown??[]).map(m=><tr key={m.match_id}><td>{m.match}</td><td>{m.prediction}</td><td>{m.without_penalties}</td><td>{m.result}</td><td>{m.without_penalties_base}</td><td>{m.with_penalties_base}</td><td><strong>{Number(m.points.toFixed(2)).toLocaleString("ru-RU")}</strong></td></tr>)}</tbody></table></div> : <p>Нет положительных начислений за пенальти.</p>}
                    </details></td></tr>)}</tbody></table></div>}
              </div>
            </>;
          })()}
        </>}
      </section>}
      {activeTab === "mine" && !isAdmin && <section className="cutover-content cutover-my-predictions">
        <div className="cutover-section-heading"><div><span>ТЕКУЩИЙ ЭТАП — {currentTable?.stage?.name ?? "Загрузка…"}</span><h2>Мои прогнозы</h2></div><p>Матчи и твои прогнозы по турам текущего этапа</p></div>
        {!currentTable?.stage ? <p>Загружаем матчи текущего этапа…</p> :
          [...currentTable.tours].sort((a,b)=>Number(a.tour_no)-Number(b.tour_no)).map(t=>{
            const unique=new Map<string,(typeof currentTable.rows)[number]>();
            for(const row of currentTable.rows.filter(row=>row.tour_id===t.id)) if(!unique.has(row.match_id)) unique.set(row.match_id,row);
            return <div className="cutover-current-tour" key={t.id}>
              <h3>{t.name}</h3>
              <div className="tableWrap"><table className="table currentTable">
                <thead><tr><th>№</th><th>Матч</th><th>Результат</th><th>Мой прогноз</th><th>Очки</th></tr></thead>
                <tbody>{[...unique.values()].map((match,index)=>{
                  const p=currentTable.rows.find(row=>row.match_id===match.match_id&&currentTable.users.some(u=>u.id===row.user_id&&u.username===sessionUsername));
                  const editableMatch=schedule.find(m=>String(m.match_id)===String(match.match_id));
                  const canEdit=Boolean(writesEnabled && editableMatch?.predictions_open);
                  const draft=editableMatch ? (drafts[editableMatch.match_id] ?? {home:String(editableMatch.home_pred ?? ""),away:String(editableMatch.away_pred ?? "")}) : null;
                  return <tr key={match.match_id}>
                    <td>{match.stage_match_no??index+1}</td>
                    <td><strong>{match.home_team} — {match.away_team}</strong><CompetitionBadge label={match.competition_label ?? editableMatch?.competition_label} />{editableMatch?.kickoff_at ? <div style={{marginTop:4,fontSize:12,color:"#526779"}}>Начало: {new Intl.DateTimeFormat("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(editableMatch.kickoff_at))} МСК</div> : editableMatch?.pending_kickoff_date && (
                      <div style={{marginTop:4,fontSize:12,color:"#526779"}}>
                        {pendingKickoffLabel(editableMatch.pending_kickoff_date)}
                      </div>
                    )}</td>
                    <td>{match.home_score===null||match.away_score===null?"—":match.home_score+":"+match.away_score}</td>
                    <td>{canEdit && editableMatch && draft ? <div className="cutover-my-prediction-editor" style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
                      <input aria-label={`Голы хозяев: ${match.home_team}`} type="number" inputMode="numeric" min="0" max="99" value={draft.home} style={{width:57,minHeight:36,padding:5}} onChange={e=>setDrafts(prev=>({...prev,[editableMatch.match_id]:{home:e.target.value,away:prev[editableMatch.match_id]?.away??String(editableMatch.away_pred??"")}}))}/>
                      <span>:</span>
                      <input aria-label={`Голы гостей: ${match.away_team}`} type="number" inputMode="numeric" min="0" max="99" value={draft.away} style={{width:57,minHeight:36,padding:5}} onChange={e=>setDrafts(prev=>({...prev,[editableMatch.match_id]:{home:prev[editableMatch.match_id]?.home??String(editableMatch.home_pred??""),away:e.target.value}}))}/>
                      <button type="button" disabled={busy} onClick={()=>void savePrediction(editableMatch)} className="cutover-save">{savedMatchId===editableMatch.match_id?"✓ Сохранено":"Сохранить"}</button>
                    </div> : p?.home_pred==null||p.away_pred==null?"—":p.home_pred+":"+p.away_pred}</td>
                    <td>{p?.points==null?"—":Number(p.points).toLocaleString("ru-RU")}</td>
                  </tr>;
                })}</tbody>
              </table></div>
            </div>;
          })
        }
      </section>}
    </>}
  </main>;
}
