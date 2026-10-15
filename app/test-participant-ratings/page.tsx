"use client";
import { useEffect, useState } from "react";

type Rating = { username:string; points:string; entries:number; group_id?:string; group_name?:string; stage_id?:string };
type Scope = "overall" | "stages" | "tours";
export default function ParticipantRatings() {
  const [scope,setScope] = useState<Scope>("overall");
  const [rows,setRows] = useState<Rating[]>([]);
  const [error,setError] = useState("");
  const [loading,setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);setError("");
    fetch("/api/test/participant-ratings?scope="+scope,{credentials:"same-origin",cache:"no-store",signal:controller.signal})
      .then(async res=>{
        if(res.status===401) throw new Error("Сессия завершилась. Войди заново.");
        if(!res.ok) throw new Error("Не удалось загрузить рейтинг.");
        return res.json();
      })
      .then(data=>{setRows(data.rows ?? []);setLoading(false);})
      .catch(e=>{if(!controller.signal.aborted){setError(e.message || "Ошибка загрузки");setLoading(false);}});
    return ()=>controller.abort();
  },[scope]);
  const groups = scope==="overall" ? [{id:"all",name:"Общий рейтинг",items:rows}] :
    Array.from(new Set(rows.map(r=>r.group_id||""))).map(id=>({
      id,name:rows.find(r=>r.group_id===id)?.group_name||id,items:rows.filter(r=>r.group_id===id)
    }));
  return <main style={{maxWidth:860,margin:"40px auto",padding:20}}>
    <h1>Рейтинги Footy — тест Neon</h1>
    <p>Только просмотр. Очки рассчитаны по импортированным начислениям и не учитывают тестовые черновики.</p>
    <p><a href="/test-participant-predictions">Мои прогнозы</a></p>
    <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
      <button onClick={()=>setScope("overall")} disabled={scope==="overall"}>Общий рейтинг</button>
      <button onClick={()=>setScope("stages")} disabled={scope==="stages"}>По этапам</button>
      <button onClick={()=>setScope("tours")} disabled={scope==="tours"}>По турам</button>
    </div>
    {loading && <p role="status">Загрузка рейтинга…</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && groups.map(g=><section key={g.id} style={{marginTop:24}}>
      <h2>{g.name}</h2>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse"}}>
        <thead><tr><th>Место</th><th>Участник</th><th>Очки</th><th>Начислений</th></tr></thead>
        <tbody>{g.items.map((r,i)=><tr key={r.username}>
          <td style={{padding:8,borderBottom:"1px solid #aaa"}}>{i+1}</td>
          <td style={{padding:8,borderBottom:"1px solid #aaa"}}>{r.username}</td>
          <td style={{padding:8,borderBottom:"1px solid #aaa"}}>{Number(r.points).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2})}</td>
          <td style={{padding:8,borderBottom:"1px solid #aaa"}}>{r.entries}</td>
        </tr>)}</tbody>
      </table></div>
    </section>)}
  </main>;
}
