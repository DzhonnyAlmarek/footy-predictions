"use client";
import {useEffect,useMemo,useState} from "react";
type Match={source:string;display_id:string;match_id:string;kickoff_at:string;deadline_at:string;status:string;has_test_edit:boolean;home_team:string;away_team:string;stage_name:string|null;tour_name:string|null;my_home_pred:number|null;my_away_pred:number|null;prediction_editable:boolean};
export default function ParticipantCalendar(){
 const [rows,setRows]=useState<Match[]>([]),[err,setErr]=useState(""),[notice,setNotice]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[filter,setFilter]=useState("upcoming"),[writes,setWrites]=useState(false),[values,setValues]=useState<Record<string,{home:string;away:string}>>({}),[busy,setBusy]=useState("");
 async function load(){
  const r=await fetch("/api/test/participant-calendar",{credentials:"same-origin",cache:"no-store"});
  const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла — войди снова.":d.error||"Ошибка");
  const list:Match[]=d.rows||[];setRows(list);setWrites(d.predictionsEnabledForNewMatches===true);
  setValues(Object.fromEntries(list.filter(m=>m.source==="new").map(m=>[m.match_id,{home:m.my_home_pred==null?"":String(m.my_home_pred),away:m.my_away_pred==null?"":String(m.my_away_pred)}])));
 }
 useEffect(()=>{void load().catch(e=>setErr(e.message));},[]);
 const filtered=useMemo(()=>{const now=Date.now();return rows.filter(m=>(filter==="all"||(filter==="upcoming"&&new Date(m.kickoff_at).getTime()>=now)||(filter==="changed"&&m.has_test_edit))&&(!search||[m.display_id,m.home_team,m.away_team].join(" ").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))));},[rows,search,filter]);
 const total=Math.max(1,Math.ceil(filtered.length/20)),shown=filtered.slice((Math.min(page,total)-1)*20,Math.min(page,total)*20);
 const date=(s:string)=>new Date(s).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})+" МСК";
 async function save(m:Match){
  if(m.source!=="new"||!writes||!m.prediction_editable||busy)return;
  const v=values[m.match_id];
  if(!/^\d+$/.test(v?.home||"")||!/^\d+$/.test(v?.away||"")||Number(v.home)>30||Number(v.away)>30){setNotice("Укажи целый счёт от 0 до 30.");return;}
  setBusy(m.match_id);setNotice("");
  try{
   const r=await fetch("/api/test/participant-new-match-predictions",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({matchId:Number(m.match_id),homePred:Number(v.home),awayPred:Number(v.away)})});
   const d=await r.json();if(!r.ok)throw Error(d.error==="deadline_or_match_unavailable"?"Дедлайн истёк или матч недоступен.":d.error||"Ошибка сохранения");
   await load();setNotice("Тестовый прогноз на "+m.display_id+" сохранён. Рабочие очки не изменены.");
  }catch(e){setNotice(e instanceof Error?e.message:"Ошибка сохранения");}finally{setBusy("");}
 }
 return <main style={{maxWidth:1080,margin:"35px auto",padding:20}}>
 <h1>Тестовое расписание участника</h1>
 <p>Единый календарь Neon. Для новых тестовых матчей доступен отдельный прогноз без влияния на рабочие очки. Импортированные матчи здесь только для просмотра.</p>
 <p><a href="/test-participant-predictions">← Прогнозы участника</a></p>
 <div style={{display:"flex",gap:12,flexWrap:"wrap"}}><label>Поиск <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Команда или ID"/></label><label>Показывать <select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="upcoming">Предстоящие</option><option value="changed">Тестовые изменения</option><option value="all">Все</option></select></label></div>
 {err&&<p role="alert">{err}</p>}{notice&&<p role="status">{notice}</p>}
 <p>Найдено матчей: {filtered.length}.</p>
 <div style={{overflowX:"auto"}}><table style={{width:"100%",minWidth:890,borderCollapse:"collapse",textAlign:"left"}}><thead><tr><th>№</th><th>Начало (МСК)</th><th>Матч</th><th>Приём до (МСК)</th><th>Этап / тур</th><th>Тип</th><th>Мой тестовый прогноз</th></tr></thead><tbody>{shown.map(m=><tr key={m.source+m.match_id} style={{borderBottom:"1px solid #d5dce6"}}><td>{m.display_id}</td><td>{date(m.kickoff_at)}</td><td>{m.home_team} — {m.away_team}</td><td>{date(m.deadline_at)}</td><td>{m.stage_name||"—"} / {m.tour_name||"—"}</td><td>{m.source==="new"?"Новый тестовый":m.has_test_edit?"Изменённый тестовый":"Импорт"}</td><td>{m.source==="new"?<div style={{minWidth:220,padding:"8px 0"}}>
 <div style={{marginBottom:5}}>{m.my_home_pred==null?"Пока нет прогноза":"Сохранён: "+m.my_home_pred+":"+m.my_away_pred}</div>
 <div style={{display:"flex",gap:5,alignItems:"center"}}>
 <input type="number" min={0} max={30} step={1} aria-label={"Хозяева "+m.display_id} style={{width:52}} value={values[m.match_id]?.home??""} onChange={e=>setValues(v=>({...v,[m.match_id]:{...(v[m.match_id]||{away:""}),home:e.target.value}}))}/>
 <span>:</span>
 <input type="number" min={0} max={30} step={1} aria-label={"Гости "+m.display_id} style={{width:52}} value={values[m.match_id]?.away??""} onChange={e=>setValues(v=>({...v,[m.match_id]:{...(v[m.match_id]||{home:""}),away:e.target.value}}))}/>
 <button disabled={!writes||!m.prediction_editable||busy!==""} onClick={()=>void save(m)}>Сохранить</button></div>
 {!m.prediction_editable&&<small>Приём закрыт</small>}
 </div>:<span>—</span>}</td></tr>)}</tbody></table></div>
 <div style={{marginTop:16,display:"flex",alignItems:"center",gap:12}}><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Назад</button><span>{Math.min(page,total)} / {total}</span><button disabled={page>=total} onClick={()=>setPage(p=>p+1)}>Далее →</button></div>
 </main>;
}
