"use client";
import { useEffect, useMemo, useState } from "react";

type Match = {
 id:string; kickoff_at:string|null; status:string; home_score:number|null; away_score:number|null;
 home_penalty_goals:number|null; away_penalty_goals:number|null;
 home_team:string; away_team:string; stage_name:string|null; tour_name:string|null;
 predictions_count:number; scored_count:number;
};
const collator = new Intl.Collator("ru",{numeric:true,sensitivity:"base"});
const inputStyle = {padding:9,border:"1px solid #8995a7",borderRadius:7,background:"#fff",maxWidth:"100%"} as const;
const cell = {padding:"10px 8px",borderBottom:"1px solid #d9dee5"} as const;
const kickoffTime = (m:Match) => m.kickoff_at ? new Date(m.kickoff_at).getTime() : Number.POSITIVE_INFINITY;

export default function MatchOverview() {
 const [matches,setMatches]=useState<Match[]>([]);
 const [status,setStatus]=useState("upcoming");
 const [stage,setStage]=useState("");
 const [tour,setTour]=useState("");
 const [search,setSearch]=useState("");
 const [expanded,setExpanded]=useState<string|null>(null);
 const [page,setPage]=useState(1);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const perPage=25;
 useEffect(()=>{
   const controller=new AbortController();
   fetch("/api/test/match-overview",{cache:"no-store",credentials:"same-origin",signal:controller.signal})
    .then(async r=>{if(r.status===401)throw new Error("Сессия завершилась. Войди заново.");if(!r.ok)throw new Error("Не удалось получить матчи");return r.json();})
    .then(d=>{if(!controller.signal.aborted){setMatches(d.rows||[]);setLoading(false);}})
    .catch(e=>{if(!controller.signal.aborted){setError(e.message);setLoading(false);}});
   return ()=>controller.abort();
 },[]);
 const stages=useMemo(()=>Array.from(new Set(matches.map(m=>m.stage_name).filter((v):v is string=>!!v))).sort(collator.compare),[matches]);
 const tours=useMemo(()=>Array.from(new Set(matches.filter(m=>!stage||m.stage_name===stage).map(m=>m.tour_name).filter((v):v is string=>!!v))).sort(collator.compare),[matches,stage]);
 const filtered=useMemo(()=>{
   const now=Date.now();
   return matches.filter(m=>
     (status==="all" || (status==="upcoming" ? m.status==="scheduled"&&kickoffTime(m)>=now : m.status===status)) &&
     (!stage||m.stage_name===stage) && (!tour||m.tour_name===tour) &&
     (!search||[m.home_team,m.away_team,m.stage_name||"",m.tour_name||"",m.id].join(" ").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")))
   ).sort((a,b)=>status==="upcoming" ? kickoffTime(a)-kickoffTime(b) : kickoffTime(b)-kickoffTime(a));
 },[matches,status,stage,tour,search]);
 const pageCount=Math.max(1,Math.ceil(filtered.length/perPage));
 const effectivePage=Math.min(page,pageCount);
 const visible=filtered.slice((effectivePage-1)*perPage,effectivePage*perPage);
 const reset=()=>{setPage(1);setExpanded(null);};
 const dateLabel=(value:string|null)=>value?new Date(value).toLocaleString("ru-RU",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Moscow"}):"—";
 return <main style={{maxWidth:1120,margin:"30px auto",padding:"16px 20px"}}>
  <h1>Матчи и результаты — тест Neon</h1>
  <p style={{color:"#586577"}}>Режим только чтения. Данные из миграционной копии. Ввод результатов и пересчёт очков отключены.</p>
  <p><a href="/test-participant-ratings">← Рейтинги</a></p>
  <div style={{display:"flex",gap:12,flexWrap:"wrap",margin:"20px 0",alignItems:"end"}}>
   <label style={{display:"grid",gap:5}}>Период и статус
    <select value={status} onChange={e=>{setStatus(e.target.value);reset();}} style={inputStyle}>
     <option value="upcoming">Ближайшие предстоящие</option><option value="all">Все матчи</option>
     <option value="scheduled">Все запланированные</option><option value="finished">Завершённые</option>
    </select>
   </label>
   <label style={{display:"grid",gap:5}}>Этап
    <select value={stage} onChange={e=>{setStage(e.target.value);setTour("");reset();}} style={inputStyle}>
     <option value="">Все этапы</option>{stages.map(s=><option key={s} value={s}>{s}</option>)}
    </select>
   </label>
   <label style={{display:"grid",gap:5}}>Тур
    <select value={tour} onChange={e=>{setTour(e.target.value);reset();}} style={inputStyle}>
     <option value="">Все туры</option>{tours.map(t=><option key={t} value={t}>{t}</option>)}
    </select>
   </label>
   <label style={{display:"grid",gap:5}}>Поиск
    <input value={search} onChange={e=>{setSearch(e.target.value);reset();}} placeholder="Команда, этап, тур, ID" style={{...inputStyle,width:225}}/>
   </label>
  </div>
  {loading&&<p role="status">Загружаем матчи…</p>}
  {error&&<p role="alert" style={{color:"#a11"}}>{error}</p>}
  {!loading&&!error&&<>
   <p>Найдено: {filtered.length} из {matches.length}. На странице: {visible.length}.</p>
   {filtered.length===0 ? <p>Подходящих матчей нет. Попробуй режим «Все матчи» или измени фильтры.</p> :
    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",textAlign:"left",minWidth:790}}>
     <thead><tr><th style={cell}>Дата (МСК)</th><th style={cell}>Матч</th><th style={cell}>Этап / тур</th><th style={cell}>Статус</th><th style={cell}>Счёт</th><th style={cell}>Прогнозов</th><th style={cell}>Начислений</th></tr></thead>
     <tbody>{visible.map(m=><tr key={m.id}>
      <td colSpan={7} style={{padding:0}}>
       <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",minWidth:790}}>
        <tbody><tr>
         <td style={{...cell,width:"13%"}}>{dateLabel(m.kickoff_at)}</td>
         <td style={{...cell,width:"25%"}}><button type="button" onClick={()=>setExpanded(expanded===m.id?null:m.id)} aria-expanded={expanded===m.id} style={{border:0,background:"transparent",color:"#164a91",cursor:"pointer",padding:0,textAlign:"left",fontWeight:600}}>{m.home_team} — {m.away_team}</button><div style={{fontSize:12,color:"#677"}}>#{m.id}</div></td>
         <td style={{...cell,width:"24%"}}>{m.stage_name||"—"} / {m.tour_name||"—"}</td>
         <td style={{...cell,width:"13%"}}>{m.status==="finished"?"Завершён":m.status==="scheduled"?"Запланирован":m.status}</td>
         <td style={{...cell,width:"8%"}}>{m.home_score!==null&&m.away_score!==null?`${m.home_score} : ${m.away_score}`:"—"}</td>
         <td style={{...cell,width:"9%"}}>{m.predictions_count}</td>
         <td style={{...cell,width:"8%"}}>{m.scored_count}</td>
        </tr></tbody>
       </table>
       {expanded===m.id&&<div style={{padding:"14px 18px",background:"#edf3fa",borderBottom:"1px solid #cbd5e1"}}>
        <strong>Карточка матча #{m.id}</strong>
        <p>{m.home_team} — {m.away_team} · {dateLabel(m.kickoff_at)} (МСК)</p>
        <p>Этап: {m.stage_name||"—"} · Тур: {m.tour_name||"—"} · Статус: {m.status}</p>
        <p>Основной счёт: {m.home_score===null||m.away_score===null?"не указан":`${m.home_score} : ${m.away_score}`}. Голы с пенальти: {m.home_penalty_goals??"—"} / {m.away_penalty_goals??"—"}.</p>
        <p>Прогнозов: {m.predictions_count}. Начислений: {m.scored_count}.</p>
        <small>Данные только для просмотра; прогнозы других участников здесь не раскрываются.</small>
       </div>}
      </td>
     </tr>)}</tbody>
    </table></div>}
   {pageCount>1&&<nav aria-label="Страницы матчей" style={{display:"flex",gap:12,alignItems:"center",marginTop:20}}>
    <button type="button" disabled={effectivePage===1} onClick={()=>{setPage(p=>Math.max(1,p-1));setExpanded(null);}}>← Назад</button>
    <span>Страница {effectivePage} из {pageCount}</span>
    <button type="button" disabled={effectivePage===pageCount} onClick={()=>{setPage(p=>Math.min(pageCount,p+1));setExpanded(null);}}>Далее →</button>
   </nav>}
  </>}
 </main>;
}
