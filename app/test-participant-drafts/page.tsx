"use client";
import { useEffect, useState } from "react";

type Match = { match_id: string; home_team: string; away_team: string; kickoff_at: string; deadline_at: string; home_pred: number | null; away_pred: number | null; editable: boolean };
export default function ParticipantDraftsPage() {
  const [matches, setMatches] = useState<Match[]>([]);
  const [status, setStatus] = useState("Загружаем матчи…");
  const [busy, setBusy] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, [string,string]>>({});
  useEffect(() => {
    fetch("/api/test/participant-drafts", {credentials:"same-origin",cache:"no-store"})
      .then(async res => { if (res.status === 401) throw Error("Войди в кабинет участника заново."); if (res.status === 404) throw Error("Тестовые черновики ещё не включены в контейнере."); if (!res.ok) throw Error("Не удалось загрузить матчи."); return res.json(); })
      .then(data => {
        const list: Match[] = data.matches || [];
        setMatches(list);
        const entries = list.map(m => [
          m.match_id,
          [m.home_pred == null ? "" : String(m.home_pred),
           m.away_pred == null ? "" : String(m.away_pred)]
        ] as [string, [string, string]]);
        setScores(Object.fromEntries(entries));
        setStatus("");
      })
      .catch(e => setStatus(e.message || "Ошибка загрузки"));
  }, []);
  async function save(m: Match) {
    const [h,a] = scores[m.match_id] || ["",""];
    if (!/^(0|[1-9]\d?)$/.test(h) || !/^(0|[1-9]\d?)$/.test(a) || Number(h) > 30 || Number(a) > 30) { setStatus("Укажи оба счёта целыми числами от 0 до 30."); return; }
    setBusy(m.match_id); setStatus("");
    try {
      const response = await fetch("/api/test/participant-drafts",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",body:JSON.stringify({match_id:m.match_id,home_pred:Number(h),away_pred:Number(a)})});
      if (!response.ok) throw Error(response.status === 409 ? "Дедлайн матча прошёл или матч недоступен." : "Не удалось сохранить черновик.");
      setStatus("Черновик сохранён в отдельной тестовой таблице Neon.");
    } catch(e) { setStatus(e instanceof Error ? e.message : "Ошибка сохранения"); }
    finally { setBusy(null); }
  }
  return <main style={{maxWidth:880,margin:"36px auto",padding:20}}>
    <h1>Прогнозы — тестовые черновики Neon</h1>
    <p><strong>Внимание:</strong> здесь сохраняются только тестовые черновики. Они не отправляются в рабочий конкурс, не влияют на результаты и не синхронизируются в Supabase.</p>
    <p><a href="/test-participant-predictions">Мои импортированные прогнозы (только просмотр)</a></p>
    {status && <p role="status">{status}</p>}
    {matches.map(m => <section key={m.match_id} style={{borderBottom:"1px solid #aaa",padding:"12px 0"}}>
      <div><strong>{m.home_team} — {m.away_team}</strong></div>
      <small>Матч: {new Date(m.kickoff_at).toLocaleString("ru-RU")}; дедлайн: {new Date(m.deadline_at).toLocaleString("ru-RU")}</small>
      <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8}}>
        <input aria-label="Голы хозяев" inputMode="numeric" style={{width:55}} value={scores[m.match_id]?.[0] ?? ""} disabled={!m.editable || busy !== null} onChange={e => setScores(prev=>({...prev,[m.match_id]:[e.target.value,prev[m.match_id]?.[1] ?? ""]}))}/>
        :
        <input aria-label="Голы гостей" inputMode="numeric" style={{width:55}} value={scores[m.match_id]?.[1] ?? ""} disabled={!m.editable || busy !== null} onChange={e => setScores(prev=>({...prev,[m.match_id]:[prev[m.match_id]?.[0] ?? "",e.target.value]}))}/>
        <button disabled={!m.editable || busy !== null} onClick={()=>save(m)}>{busy === m.match_id ? "Сохраняем…" : "Сохранить черновик"}</button>
      </div>
    </section>)}
    {!status && matches.length === 0 && <p>Доступных матчей нет.</p>}
  </main>;
}
