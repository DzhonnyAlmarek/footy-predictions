"use client";
import {useEffect,useState} from "react";
type Match={match_id:string;home_team:string;away_team:string;kickoff_at:string;deadline_at:string;home_pred:number|null;away_pred:number|null;editable:boolean};
export default function NewMatchPredictions(){
 const [matches,setMatches]=useState<Match[]>([]),[readonly,setReadonly]=useState(true),[loading,setLoading]=useState(true),[message,setMessage]=useState(""),[busy,setBusy]=useState(false),[values,setValues]=useState<Record<string,{home:string;away:string}>>({});
 async function load(){
  const r=await fetch("/api/test/participant-new-match-predictions",{credentials:"same-origin",cache:"no-store"});
  const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла — войди заново.":d.error||"Ошибка загрузки");
  setMatches(d.matches||[]);setReadonly(d.readonly);setValues(Object.fromEntries((d.matches||[]).map((m:Match)=>[m.match_id,{home:m.home_pred==null?"":String(m.home_pred),away:m.away_pred==null?"":String(m.away_pred)}])));
 }
 useEffect(()=>{void load().catch(e=>setMessage(e.message)).finally(()=>setLoading(false));},[]);
 async function save(m:Match){
  if(readonly||busy||!m.editable)return;
  const v=values[m.match_id],h=Number(v?.home),a=Number(v?.away);
  if(!/^\d+$/.test(v?.home||"")||!/^\d+$/.test(v?.away||"")||h>30||a>30){setMessage("Укажи целый счёт от 0 до 30.");return;}
  setBusy(true);setMessage("");
  try{
   const r=await fetch("/api/test/participant-new-match-predictions",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({matchId:Number(m.match_id),homePred:h,awayPred:a})});
   const d=await r.json();if(!r.ok)throw Error(d.error==="deadline_or_match_unavailable"?"Приём прогнозов завершён или матч недоступен.":d.error||"Ошибка сохранения");
   await load();setMessage("Тестовый прогноз сохранён. На рабочие очки он не влияет.");
  }catch(e){setMessage(e instanceof Error?e.message:"Ошибка");}finally{setBusy(false);}
 }
 const date=(s:string)=>new Date(s).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",dateStyle:"short",timeStyle:"short"})+" МСК";
 return <main style={{maxWidth:850,margin:"35px auto",padding:20}}>
  <h1>Прогнозы на новые тестовые матчи</h1>
  <p>Только изолированная Neon. Прогнозы не начисляют очки и не меняют рабочий Footy.</p>
  <p><a href="/test-participant-calendar">← Расписание участника</a></p>
  {loading&&<p>Загрузка...</p>}
  {!loading&&<p>{readonly?"Запись тестовых прогнозов пока отключена.":"Запись разрешена только в тестовые черновики."}</p>}
  {matches.map(m=><section key={m.match_id} style={{border:"1px solid #d0d7e2",borderRadius:10,padding:15,margin:"14px 0"}}>
   <strong>T-{m.match_id} · {m.home_team} — {m.away_team}</strong>
   <p>Начало: {date(m.kickoff_at)}. Приём до: {date(m.deadline_at)}.</p>
   <div style={{display:"flex",alignItems:"end",gap:10,flexWrap:"wrap"}}>
    <label>Хозяева <input type="number" min={0} max={30} step={1} style={{width:70,display:"block"}} value={values[m.match_id]?.home??""} onChange={e=>setValues(v=>({...v,[m.match_id]:{...(v[m.match_id]||{away:""}),home:e.target.value}}))}/></label>
    <label>Гости <input type="number" min={0} max={30} step={1} style={{width:70,display:"block"}} value={values[m.match_id]?.away??""} onChange={e=>setValues(v=>({...v,[m.match_id]:{...(v[m.match_id]||{home:""}),away:e.target.value}}))}/></label>
    <button disabled={readonly||busy||!m.editable} onClick={()=>void save(m)}>{busy?"Сохранение...":"Сохранить тестовый прогноз"}</button>
   </div>
   {!m.editable&&<p>Приём прогнозов на этот матч закрыт.</p>}
  </section>)}
  <p role="status">{message}</p>
 </main>;
}
