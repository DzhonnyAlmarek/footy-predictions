"use client";
import {useEffect,useMemo,useState} from "react";
type Match={source:string;display_id:string;match_id:string;kickoff_at:string;deadline_at:string;status:string;has_test_edit:boolean;home_team:string;away_team:string;stage_name:string|null;tour_name:string|null};
export default function ParticipantCalendar(){
 const [rows,setRows]=useState<Match[]>([]),[err,setErr]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[filter,setFilter]=useState("upcoming");
 useEffect(()=>{fetch("/api/test/participant-calendar",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла — войди снова.":d.error||"Ошибка");setRows(d.rows||[]);}).catch(e=>setErr(e.message));},[]);
 const filtered=useMemo(()=>{const now=Date.now();return rows.filter(m=>(filter==="all"||(filter==="upcoming"&&new Date(m.kickoff_at).getTime()>=now)||(filter==="changed"&&m.has_test_edit))&&(!search||[m.display_id,m.home_team,m.away_team].join(" ").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))));},[rows,search,filter]);
 const total=Math.max(1,Math.ceil(filtered.length/20)),shown=filtered.slice((Math.min(page,total)-1)*20,Math.min(page,total)*20);
 const date=(s:string)=>new Date(s).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})+" МСК";
 return <main style={{maxWidth:1080,margin:"35px auto",padding:20}}>
 <h1>Тестовое расписание участника</h1><p>Единый календарь Neon — только просмотр. Прогнозы и начисления не изменяются.</p>
 <p><a href="/test-participant-predictions">← Прогнозы участника</a></p>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><label>Поиск <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Команда или ID"/></label><label>Показывать <select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="upcoming">Предстоящие</option><option value="changed">Тестовые изменения</option><option value="all">Все</option></select></label></div>
 {err&&<p role="alert">{err}</p>}<p>Найдено матчей: {filtered.length}. Новые тестовые матчи не принимают прогнозы.</p>
 <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:790,borderCollapse:"collapse",textAlign:"left"}}><thead><tr><th>№</th><th>Начало (МСК)</th><th>Матч</th><th>Приём до (МСК)</th><th>Этап / тур</th><th>Тип</th></tr></thead><tbody>{shown.map(m=><tr key={m.source+m.match_id} style={{borderBottom:"1px solid #d5dce6"}}><td>{m.display_id}</td><td>{date(m.kickoff_at)}</td><td>{m.home_team} — {m.away_team}</td><td>{date(m.deadline_at)}</td><td>{m.stage_name||"—"} / {m.tour_name||"—"}</td><td>{m.source==="new"?"Тестовый, без прогнозов":m.has_test_edit?"Изменённый тестовый":"Импорт"}</td></tr>)}</tbody></table></div>
 <div style={{marginTop:16,display:"flex",alignItems:"center",gap:12}}><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Назад</button><span>{Math.min(page,total)} / {total}</span><button disabled={page>=total} onClick={()=>setPage(p=>p+1)}>Далее →</button></div>
 </main>;
}
