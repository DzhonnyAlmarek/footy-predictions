"use client";
import { useEffect,useMemo,useState } from "react";
type Match = {id:string;kickoff_at:string|null;status:string;home_score:number|null;away_score:number|null;
 home_penalty_goals:number|null;away_penalty_goals:number|null;home_team:string;away_team:string;
 stage_name:string|null;tour_name:string|null;predictions_count:number;scored_count:number};
export default function MatchOverview() {
 const [matches,setMatches]=useState<Match[]>([]);
 const [status,setStatus]=useState("all");
 const [search,setSearch]=useState("");
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 useEffect(()=>{const c=new AbortController();
   fetch("/api/test/match-overview",{cache:"no-store",credentials:"same-origin",signal:c.signal})
    .then(async r=>{if(r.status===401)throw new Error("Сессия завершилась. Войди заново.");if(!r.ok)throw new Error("Не удалось получить матчи");return r.json();})
    .then(d=>{if(!c.signal.aborted){setMatches(d.rows||[]);setLoading(false);}})
    .catch(e=>{if(!c.signal.aborted){setError(e.message);setLoading(false);}});
   return ()=>c.abort();
 },[]);
 const filtered=useMemo(()=>matches.filter(m=>
   (status==="all"||m.status===status) &&
   (!search||[m.home_team,m.away_team,m.stage_name||"",m.tour_name||"",m.id].join(" ").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")))
 ),[matches,status,search]);
 const cell={padding:"10px 8px",borderBottom:"1px solid #ddd"};
 return <main style={{maxWidth:1120,margin:"30px auto",padding:"16px 20px"}}>
  <h1>Матчи и результаты — тест Neon</h1>
  <p>Режим только чтения. Данные из миграционной копии; изменение результатов и пересчёт очков здесь отключены.</p>
  <p><a href="/test-participant-ratings">← Рейтинги</a></p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"20px 0"}}>
   <label>Статус <select value={status} onChange={e=>setStatus(e.target.value)} style={{padding:8,marginLeft:8}}>
    <option value="all">Все</option><option value="scheduled">Предстоящие</option><option value="finished">Завершённые</option>
   </select></label>
   <label>Поиск <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Команда, этап, тур или ID" style={{padding:8,marginLeft:8,width:250,maxWidth:"75vw"}}/></label>
  </div>
  {loading&&<p role="status">Загружаем матчи…</p>}
  {error&&<p role="alert" style={{color:"#a11"}}>{error}</p>}
  {!loading&&!error&&<><p>Показано: {filtered.length} из {matches.length}</p>
   <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",minWidth:790}}>
    <thead><tr><th style={cell}>Дата</th><th style={cell}>Матч</th><th style={cell}>Этап / тур</th><th style={cell}>Статус</th><th style={cell}>Счёт</th><th style={cell}>Прогнозов</th><th style={cell}>Начислений</th></tr></thead>
    <tbody>{filtered.map(m=><tr key={m.id}>
     <td style={cell}>{m.kickoff_at?new Date(m.kickoff_at).toLocaleString("ru-RU",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Moscow"}):"—"}</td>
     <td style={cell}>{m.home_team} — {m.away_team}<div style={{fontSize:12,color:"#666"}}>#{m.id}</div></td>
     <td style={cell}>{m.stage_name||"—"} / {m.tour_name||"—"}</td>
     <td style={cell}>{m.status==="finished"?"Завершён":m.status==="scheduled"?"Запланирован":m.status}</td>
     <td style={cell}>{m.home_score!==null&&m.away_score!==null?`${m.home_score} : ${m.away_score}`:"—"}</td>
     <td style={cell}>{m.predictions_count}</td><td style={cell}>{m.scored_count}</td>
    </tr>)}</tbody>
   </table></div>
   {filtered.length===0&&<p>Подходящих матчей нет.</p>}
  </>}
 </main>;
}
