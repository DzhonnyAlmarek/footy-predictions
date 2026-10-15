"use client";
import {useEffect,useMemo,useState} from "react";
type Match={source:string;display_id:string;match_id:string;kickoff_at:string;deadline_at:string;status:string;has_test_edit:boolean;home_team:string;away_team:string;stage_name:string|null;tour_name:string|null;my_home_pred:number|null;my_away_pred:number|null;prediction_editable:boolean};
export default function ParticipantCalendar(){
 const [rows,setRows]=useState<Match[]>([]),[err,setErr]=useState(""),[notice,setNotice]=useState(""),[search,setSearch]=useState(""),[page,setPage]=useState(1),[filter,setFilter]=useState("upcoming"),[writes,setWrites]=useState(false),[importedWrites,setImportedWrites]=useState(false),[values,setValues]=useState<Record<string,{home:string;away:string}>>({}),[busy,setBusy]=useState("");
 async function load(){
  const r=await fetch("/api/test/participant-calendar",{credentials:"same-origin",cache:"no-store"});
  const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла — войди снова.":d.error||"Ошибка");
  const list:Match[]=d.rows||[];setRows(list);setWrites(d.predictionsEnabledForNewMatches===true);setImportedWrites(d.predictionsEnabledForImportedMatches===true);
  setValues(Object.fromEntries(list.map(m=>[m.match_id,{home:m.my_home_pred==null?"":String(m.my_home_pred),away:m.my_away_pred==null?"":String(m.my_away_pred)}])));
 }
 useEffect(()=>{void load().catch(e=>setErr(e.message));},[]);
 const filtered=useMemo(()=>{const now=Date.now();return rows.filter(m=>(filter==="all"||(filter==="upcoming"&&new Date(m.kickoff_at).getTime()>=now)||(filter==="changed"&&m.has_test_edit))&&(!search||[m.display_id,m.home_team,m.away_team,m.stage_name,m.tour_name].join(" ").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru"))));},[rows,search,filter]);
 const total=Math.max(1,Math.ceil(filtered.length/20)),shown=filtered.slice((Math.min(page,total)-1)*20,Math.min(page,total)*20);
 const groups=useMemo(()=>{const result:{name:string;matches:Match[]}[]=[];for(const m of shown){const name=(m.stage_name||"Без этапа")+" · "+(m.tour_name||"Без тура");const g=result.find(x=>x.name===name);if(g)g.matches.push(m);else result.push({name,matches:[m]});}return result;},[shown]);
 const date=(s:string)=>new Date(s).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"})+" МСК";
 async function save(m:Match){
  if(!(m.source==="new"?writes:importedWrites)||!m.prediction_editable||busy)return;
  const v=values[m.match_id];if(!/^\d+$/.test(v?.home||"")||!/^\d+$/.test(v?.away||"")||Number(v.home)>30||Number(v.away)>30){setNotice("Укажи целый счёт от 0 до 30.");return;}
  setBusy(m.match_id);setNotice("");
  try{
   const r=await fetch(m.source==="new"?"/api/test/participant-new-match-predictions":"/api/test/participant-imported-match-predictions",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({matchId:Number(m.match_id),homePred:Number(v.home),awayPred:Number(v.away)})});
   const d=await r.json();if(!r.ok)throw Error(d.error==="deadline_or_match_unavailable"?"Дедлайн истёк или матч недоступен.":d.error||"Ошибка сохранения");
   await load();setNotice("Тестовый прогноз на "+m.display_id+" сохранён. Рабочие очки не изменены.");
  }catch(e){setNotice(e instanceof Error?e.message:"Ошибка сохранения");}finally{setBusy("");}
 }
 return <main className="calendar">
 <h1>Расписание и прогнозы</h1>
 <p className="intro">Тестовая площадка Neon · прогнозы не влияют на рабочие очки.</p>
 <p><a href="/test-participant-predictions">← Прогнозы участника</a></p>
 <div className="toolbar"><label>Поиск<input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Команда, матч или тур"/></label><label>Показывать<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="upcoming">Предстоящие</option><option value="changed">Тестовые изменения</option><option value="all">Все</option></select></label></div>
 {err&&<p role="alert" className="alert">{err}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
 <p className="counter">Найдено матчей: {filtered.length}. Страница {Math.min(page,total)} из {total}.</p>
 {groups.map(g=><section key={g.name} className="group"><h2>{g.name}</h2><div className="matches">{g.matches.map(m=><article key={m.source+m.match_id} className={"match "+(m.source==="new"?"sandbox":"")}>
 <div className="details"><div className="meta"><span className="id">{m.display_id}</span><span>{date(m.kickoff_at)}</span>{m.source==="new"&&<span className="tag">Тестовый</span>}{m.source!=="new"&&m.has_test_edit&&<span className="tag">Изменён</span>}</div>
 <strong className="teams">{m.home_team} <span>—</span> {m.away_team}</strong>
 <div className="deadline">Приём до: {date(m.deadline_at)}</div></div>
 <div className="prediction">{<>
  <div className="saved">{m.my_home_pred===null?"Прогноз не сделан":"Мой прогноз: "+m.my_home_pred+":"+m.my_away_pred}</div>
  {m.prediction_editable&&(m.source==="new"?writes:importedWrites)?<div className="score"><input type="number" min={0} max={30} step={1} aria-label={"Хозяева "+m.display_id} value={values[m.match_id]?.home??""} onChange={e=>setValues(v=>({...v,[m.match_id]:{...(v[m.match_id]||{away:""}),home:e.target.value}}))}/><span>:</span><input type="number" min={0} max={30} step={1} aria-label={"Гости "+m.display_id} value={values[m.match_id]?.away??""} onChange={e=>setValues(v=>({...v,[m.match_id]:{...(v[m.match_id]||{home:""}),away:e.target.value}}))}/><button disabled={busy!==""} onClick={()=>void save(m)}>{busy===m.match_id?"Сохраняю…":"Сохранить"}</button></div>:<span className="closed">{!(m.source==="new"?writes:importedWrites)?"Запись тестовых прогнозов отключена":"Приём закрыт"}</span>}
 </>}</div>
 </article>)}</div></section>)}
 {!err&&shown.length===0&&<p>Матчи не найдены.</p>}
 <nav className="pager"><button disabled={page<=1} onClick={()=>setPage(p=>p-1)}>← Назад</button><span>{Math.min(page,total)} / {total}</span><button disabled={page>=total} onClick={()=>setPage(p=>p+1)}>Далее →</button></nav>
 <style jsx>{`
 .calendar{max-width:1000px;margin:32px auto;padding:0 18px 36px;color:#172338}.calendar h1{font-size:clamp(25px,4vw,32px);margin-bottom:4px}.intro,.counter,.deadline{color:#64748b}.intro{margin-top:4px}.toolbar{display:flex;gap:14px;flex-wrap:wrap;margin:22px 0 14px}.toolbar label{display:flex;flex-direction:column;gap:5px;color:#475569;font-size:14px}.toolbar input,.toolbar select{border:1px solid #cbd5e1;border-radius:8px;padding:10px;min-height:42px;background:white;color:#172338}.toolbar input{min-width:240px}.counter{font-size:14px}.group{margin-top:24px}.group h2{font-size:17px;margin:0 0 10px;padding:0 2px;color:#334155}.matches{display:grid;gap:9px}.match{border:1px solid #d9e1ed;border-radius:12px;padding:14px 16px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;background:#fff}.match.sandbox{border-color:#aac5e9;background:#f7faff}.details{min-width:0}.meta{display:flex;gap:9px;align-items:center;flex-wrap:wrap;font-size:12px;color:#64748b;margin-bottom:6px}.id{font-weight:700;color:#334155}.tag{background:#e5efff;color:#21599e;padding:3px 7px;border-radius:14px}.teams{font-size:16px;line-height:1.4;display:block}.teams span{color:#94a3b8}.deadline{font-size:12px;margin-top:6px}.prediction{text-align:right;min-width:190px}.saved{font-size:14px;font-weight:650;margin-bottom:7px}.score{display:flex;align-items:center;justify-content:flex-end;gap:7px}.score input{width:50px;min-height:38px;padding:5px;border-radius:7px;border:1px solid #b9c9dd;text-align:center;background:white;color:#172338}.score button,.pager button{border-radius:8px;border:1px solid #b7c9e0;padding:9px 12px;background:#e7f0fe;color:#153d72;cursor:pointer}.score button:disabled,.pager button:disabled{opacity:.45;cursor:not-allowed}.closed{font-size:13px;color:#a04630}.readOnly{font-size:12px;color:#8491a5}.pager{display:flex;justify-content:center;align-items:center;gap:16px;margin-top:24px}.notice{padding:10px 12px;border-radius:8px;background:#eef7ed;color:#245c33}.alert{color:#a12424}
 @media(max-width:630px){.calendar{margin:18px auto;padding:0 12px 28px}.toolbar{display:grid;grid-template-columns:1fr 1fr;gap:9px}.toolbar input{min-width:0;width:100%}.toolbar select{width:100%}.match{grid-template-columns:1fr;padding:13px;gap:10px}.prediction{text-align:left;min-width:0;border-top:1px solid #e2e8f0;padding-top:9px}.score{justify-content:flex-start;flex-wrap:wrap}.teams{font-size:15px}.group{margin-top:20px}.group h2{font-size:15px}}
 `}</style>
 </main>;
}
