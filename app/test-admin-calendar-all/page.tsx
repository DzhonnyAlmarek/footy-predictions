"use client";
import {useEffect,useMemo,useState} from "react";
type Item={source:string;match_id:string;display_id:string;kickoff_at:string;deadline_at:string;home_team:string;away_team:string;stage_name:string|null;tour_name:string|null;status:string;is_deleted:boolean;has_test_edit:boolean};
export default function CalendarEffective(){
 const [rows,setRows]=useState<Item[]>([]),[err,setErr]=useState(""),[search,setSearch]=useState(""),[filter,setFilter]=useState("active"),[page,setPage]=useState(1);
 useEffect(()=>{fetch("/api/test/admin/calendar-effective",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const j=await r.json();if(!r.ok)throw Error(j.error||"Ошибка загрузки");setRows(j.rows||[]);}).catch(e=>setErr(e.message));},[]);
 const filtered=useMemo(()=>rows.filter(r=>(filter==="all"||(filter==="active"&&!r.is_deleted)||(filter==="changed"&&r.has_test_edit)||(filter==="hidden"&&r.is_deleted))&&(!search||[r.display_id,r.home_team,r.away_team,r.stage_name||"",r.tour_name||""].join(" ").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")))),[rows,filter,search]);
 const pages=Math.max(1,Math.ceil(filtered.length/25)),shown=filtered.slice((Math.min(page,pages)-1)*25,Math.min(page,pages)*25);
 const date=(s:string)=>new Date(s).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});
 return <main style={{maxWidth:1120,margin:"30px auto",padding:20}}>
  <h1>Единый тестовый календарь — ADMIN</h1><p>Импортированные матчи + изменения + новые тестовые черновики. Исходный календарь не меняется.</p>
  <p><a href="/test-admin-calendar">Новые матчи</a> · <a href="/test-admin-calendar-imported">Изменения импортированных</a> · <a href="/test-admin-results">Результаты</a></p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}><label>Поиск <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Команда или №"/></label><label>Фильтр <select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="active">Активные</option><option value="changed">Тестовые изменения</option><option value="hidden">Скрытые</option><option value="all">Все</option></select></label></div>
  {err&&<p role="alert">{err}</p>}<p>Импортировано: {rows.filter(r=>r.source==="imported").length}. Новых: {rows.filter(r=>r.source==="new").length}. Найдено: {filtered.length}.</p>
  <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:850,textAlign:"left"}}><thead><tr><th>№</th><th>Начало (МСК)</th><th>Матч</th><th>Этап / тур</th><th>Статус</th><th>Источник</th><th>Действие</th></tr></thead><tbody>{shown.map(r=><tr key={r.source+r.match_id} style={{borderBottom:"1px solid #d4dbe6",opacity:r.is_deleted?.65:1}}><td>{r.display_id}</td><td>{date(r.kickoff_at)}</td><td>{r.home_team} — {r.away_team}</td><td>{r.stage_name||"—"} / {r.tour_name||"—"}</td><td>{r.is_deleted?"Скрыт":r.status}</td><td>{r.source==="new"?"Новый тестовый":r.has_test_edit?"Изменённый":"Импорт"}</td><td><a href={r.source==="new"?"/test-admin-calendar":"/test-admin-calendar-imported"}>{r.source==="new"?"Открыть":"Изменить"}</a></td></tr>)}</tbody></table></div>
  <div style={{marginTop:15,display:"flex",gap:12,alignItems:"center"}}><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Назад</button><span>{Math.min(page,pages)} / {pages}</span><button disabled={page>=pages} onClick={()=>setPage(p=>p+1)}>Далее →</button></div>
 </main>;
}
