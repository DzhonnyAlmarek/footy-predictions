"use client";
import { useEffect, useMemo, useState } from "react";

type Scope = "overall" | "stages" | "tours";
type Rating = {
  username: string; points: string; entries: number;
  group_id?: string; group_name?: string; stage_id?: string; stage_name?: string;
};
const numberInName = (name: string) => {
  const match = name.match(/(?:этап|тур)\s*(\d+)/i);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
};
const formatPoints = (points: string) =>
  Number(points).toLocaleString("ru-RU", {minimumFractionDigits: 2, maximumFractionDigits: 2});

export default function ParticipantRatings() {
  const [scope, setScope] = useState<Scope>("overall");
  const [rows, setRows] = useState<Rating[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setRows([]);
    setSelectedId("");
    fetch("/api/test/participant-ratings?scope=" + scope, {
      credentials: "same-origin", cache: "no-store", signal: controller.signal
    }).then(async res => {
      if (res.status === 401) throw new Error("Сессия завершилась. Войди заново.");
      if (!res.ok) throw new Error("Не удалось загрузить рейтинг.");
      return res.json();
    }).then(data => {
      if (!controller.signal.aborted) { setRows(data.rows ?? []); setLoading(false); }
    }).catch(err => {
      if (!controller.signal.aborted) { setError(err.message || "Ошибка загрузки"); setLoading(false); }
    });
    return () => controller.abort();
  }, [scope]);

  const groups = useMemo(() => {
    if (scope === "overall") return [{ id: "overall", label: "Общий рейтинг", items: rows }];
    const map = new Map<string, { id: string; label: string; items: Rating[]; stage: string; order: number }>();
    for (const row of rows) {
      const id = row.group_id ?? "";
      if (!id) continue;
      if (!map.has(id)) map.set(id, {
        id,
        label: scope === "tours" && row.stage_name
          ? row.stage_name + " — " + (row.group_name ?? id)
          : row.group_name ?? id,
        stage: row.stage_name ?? "",
        order: numberInName(row.group_name ?? ""),
        items: []
      });
      map.get(id)!.items.push(row);
    }
    const result = Array.from(map.values());
    result.sort((a, b) => {
      if (scope === "tours") {
        const stageDifference = numberInName(a.stage) - numberInName(b.stage);
        if (stageDifference !== 0) return stageDifference;
      }
      return a.order - b.order || a.label.localeCompare(b.label, "ru");
    });
    return result;
  }, [rows, scope]);

  const currentId = groups.some(group => group.id === selectedId)
    ? selectedId
    : (groups.find(group => group.items.some(row => Number(row.entries) > 0)) ?? groups[0])?.id ?? "";
  const current = groups.find(group => group.id === currentId);
  const hasResults = Boolean(current?.items.some(row => Number(row.entries) > 0));

  return <main style={{maxWidth:860,margin:"32px auto",padding:"16px 20px"}}>
    <h1 style={{marginBottom:8}}>Рейтинги Footy — тест Neon</h1>
    <p style={{color:"#555",marginTop:0}}>Только просмотр. Данные из импортированных начислений, без тестовых черновиков.</p>
    <p><a href="/test-participant-predictions">← Мои прогнозы</a></p>
    <p><a href="/test-match-overview">Матчи и результаты (только просмотр) →</a></p>
    <nav aria-label="Вид рейтинга" style={{display:"flex",gap:8,flexWrap:"wrap",margin:"20px 0"}}>
      {([
        ["overall", "Общий рейтинг"],
        ["stages", "По этапам"],
        ["tours", "По турам"]
      ] as const).map(([value,label]) =>
        <button key={value} type="button" onClick={() => setScope(value)}
          aria-pressed={scope === value}
          style={{padding:"9px 14px",borderRadius:8,cursor:"pointer",
            border:"1px solid #8b94a3",background:scope===value?"#183a69":"#fff",
            color:scope===value?"#fff":"#15253d",fontWeight:scope===value?700:400}}>
          {label}
        </button>)}
    </nav>
    {loading && <p role="status">Загрузка рейтинга…</p>}
    {error && <p role="alert" style={{color:"#9b1c1c"}}>{error}</p>}
    {!loading && !error && <>
      {scope !== "overall" && groups.length > 0 && <div style={{marginBottom:24}}>
        <label htmlFor="rating-group" style={{display:"block",marginBottom:8,fontWeight:600}}>
          {scope === "stages" ? "Выбери этап" : "Выбери тур"}
        </label>
        <select id="rating-group" value={currentId} onChange={e => setSelectedId(e.target.value)}
          style={{maxWidth:"100%",width:420,padding:10,border:"1px solid #8b94a3",borderRadius:8,background:"#fff",color:"#15253d"}}>
          {groups.map(group => <option key={group.id} value={group.id}>{group.label}</option>)}
        </select>
      </div>}
      {!current && <p>Для этого рейтинга пока нет данных.</p>}
      {current && <section>
        <h2 style={{marginBottom:12}}>{current.label}</h2>
        {!hasResults && scope !== "overall" ? <p>Матчи ещё не рассчитаны — начислений нет.</p> :
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",textAlign:"left"}}>
              <thead><tr><th style={{padding:10}}>Место</th><th style={{padding:10}}>Участник</th>
                <th style={{padding:10}}>Очки</th><th style={{padding:10}}>Начислений</th></tr></thead>
              <tbody>{[...current.items].sort((a,b) => Number(b.points)-Number(a.points) ||
                a.username.localeCompare(b.username,"ru")).map((row,i) =>
                <tr key={row.username}>
                  <td style={{padding:10,borderBottom:"1px solid #ddd"}}>{i+1}</td>
                  <td style={{padding:10,borderBottom:"1px solid #ddd"}}>{row.username}</td>
                  <td style={{padding:10,borderBottom:"1px solid #ddd",fontWeight:600}}>{formatPoints(row.points)}</td>
                  <td style={{padding:10,borderBottom:"1px solid #ddd"}}>{row.entries}</td>
                </tr>)}</tbody>
            </table>
          </div>}
      </section>}
    </>}
  </main>;
}
