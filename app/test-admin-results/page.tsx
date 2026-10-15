"use client";
import { useEffect,useState } from "react";
type Rating={username:string;original_points:string;preview_points:string;delta:string};
type Match={match_id:string;original_status:string;original_home_score:number|null;original_away_score:number|null;preview_status:string;preview_home_score:number|null;preview_away_score:number|null;has_test_override:boolean};
export default function AdminTestResult() {
 const [ratings,setRatings]=useState<Rating[]>([]);const [overrides,setOverrides]=useState(0);const [ratingError,setRatingError]=useState("");
 const [id,setId]=useState("");const [match,setMatch]=useState<Match|null>(null);
 const [home,setHome]=useState("0");const [away,setAway]=useState("0");
 const [hp,setHp]=useState("0");const [ap,setAp]=useState("0");
 const [readonly,setReadonly]=useState(true);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState("");
 async function loadRatings(){try{const r=await fetch("/api/test/admin/ratings-preview",{cache:"no-store",credentials:"same-origin"});const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка рейтинга");setRatings(d.ratings);setOverrides(d.overrides);setRatingError("");}catch(e){setRatingError(e instanceof Error?e.message:"Ошибка рейтинга");}}
 useEffect(()=>{void loadRatings();},[]);
 async function load(matchId:string) {
  setBusy(true);setMsg("");setMatch(null);
  try {
   const r=await fetch("/api/test/admin/result-draft?matchId="+encodeURIComponent(matchId),{cache:"no-store",credentials:"same-origin"});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось загрузить матч");
   setMatch(d.match);setReadonly(d.readonly);
   setHome(String(d.match.preview_home_score??0));setAway(String(d.match.preview_away_score??0));setHp("0");setAp("0");
  }catch(e){setMsg(e instanceof Error?e.message:"Ошибка");}
  finally{setBusy(false);}
 }
 async function update(method:"POST"|"DELETE") {
  if(!match||readonly)return;
  if(method==="DELETE"&&!window.confirm("Удалить только тестовый результат матча?"))return;
  setBusy(true);setMsg("");
  try {
   const options:RequestInit={method,credentials:"same-origin",cache:"no-store",
    headers:{"Content-Type":"application/json"}};
   const url="/api/test/admin/result-draft"+(method==="DELETE"?"?matchId="+encodeURIComponent(match.match_id):"");
   if(method==="POST"){
    const values=[home,away,hp,ap].map(Number);
    if([home,away,hp,ap].some(v=>!/^\d+$/.test(v))||values.some(n=>!Number.isInteger(n)||n<0||n>30)||values[2]>values[0]||values[3]>values[1]){setMsg("Проверь счёт и голы с пенальти (0–30).");setBusy(false);return;}
    options.body=JSON.stringify({matchId:Number(match.match_id),homeScore:values[0],awayScore:values[1],homePenaltyGoals:values[2],awayPenaltyGoals:values[3]});
   }
   const r=await fetch(url,options);const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка сохранения");
   await load(match.match_id);await loadRatings();setMsg(method==="POST"?"Тестовый результат сохранён.":"Тестовый результат удалён.");
  }catch(e){setMsg(e instanceof Error?e.message:"Ошибка");}
  finally{setBusy(false);}
 }
 return <main style={{maxWidth:650,margin:"35px auto",padding:20}}>
  <h1>Тестовый ввод результатов — ADMIN</h1>
  <p>Изолированная Neon. Импортированные матчи и рабочий Footy не изменяются.</p>
  <p><a href="/test-match-overview">← Список матчей</a></p>
  <form onSubmit={e=>{e.preventDefault();if(/^\d{1,15}$/.test(id))void load(id);else setMsg("Укажи корректный ID матча.");}} style={{display:"flex",gap:10,margin:"20px 0"}}>
   <label>ID матча <input required inputMode="numeric" value={id} onChange={e=>setId(e.target.value)} style={{padding:8,width:135,marginLeft:8}}/></label>
   <button type="submit" disabled={busy}>Загрузить</button>
  </form>
  {match&&<section style={{border:"1px solid #d0d7e2",borderRadius:10,padding:18}}>
   <h2>Матч #{match.match_id}</h2>
   <p>Исходный статус: {match.original_status}. Исходный счёт: {match.original_home_score??"—"} : {match.original_away_score??"—"}.</p>
   <p>Тестовый счёт: {match.preview_home_score??"—"} : {match.preview_away_score??"—"}; {match.has_test_override?"изменён":"совпадает с исходным"}.</p>
   {readonly?<p><strong>Запись выключена.</strong> Для неё нужен отдельный переключатель в тестовом контейнере.</p>:<>
    <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:14}}>
     {([["Голы хозяев",home,setHome],["Голы гостей",away,setAway],["С пенальти хозяев",hp,setHp],["С пенальти гостей",ap,setAp]] as const).map(([label,value,setter])=><label key={label}>{label}<input type="number" required min={0} max={30} step={1} value={value} onChange={e=>setter(e.target.value)} style={{display:"block",width:"90%",padding:8}}/></label>)}
    </div>
    <div style={{display:"flex",gap:12,marginTop:18,flexWrap:"wrap"}}>
     <button type="button" disabled={busy} onClick={()=>void update("POST")}>Сохранить только тестовый результат</button>
     {match.has_test_override&&<button type="button" disabled={busy} onClick={()=>void update("DELETE")}>Отменить тестовый результат</button>}
    </div>
   </>}
  </section>}
  <p role="status">{msg}</p>
  <section style={{marginTop:28,border:"1px solid #d0d7e2",borderRadius:10,padding:18}}>
   <h2>Рейтинг: исходный и тестовый</h2>
   <p>Тестовых изменений матчей: {overrides}. Расчёт только для просмотра, начисления не изменяются.</p>
   <button type="button" onClick={()=>void loadRatings()}>Обновить рейтинг</button>
   {ratingError&&<p role="alert">{ratingError}</p>}
   <div style={{overflowX:"auto",marginTop:12}}><table style={{borderCollapse:"collapse",width:"100%",textAlign:"right"}}>
    <thead><tr><th style={{textAlign:"left"}}>Участник</th><th>Исходный</th><th>Тестовый</th><th>Разница</th></tr></thead>
    <tbody>{ratings.map(x=><tr key={x.username}><td style={{textAlign:"left",padding:"8px 4px"}}>{x.username}</td><td>{x.original_points}</td><td>{x.preview_points}</td><td style={{color:Number(x.delta)>0?"green":Number(x.delta)<0?"#b42318":"inherit"}}>{Number(x.delta)>0?"+":""}{x.delta}</td></tr>)}</tbody>
   </table></div>
  </section>
 </main>;
}
