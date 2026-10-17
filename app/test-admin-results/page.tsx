"use client";
import { useEffect,useMemo,useState } from "react";
type ListedMatch={home_score:number|null;away_score:number|null;id:string;home_team:string;away_team:string;stage_name:string|null;tour_name:string|null;kickoff_at:string|null;status:string};
type ChangedMatch={id:string;home_score:number;away_score:number};
type Rating={username:string;original_points:string;preview_points:string;new_match_points:string;delta:string};
type NewMatch={id:string;home_team:string;away_team:string;stage_name:string|null;tour_name:string|null;kickoff_at:string;is_deleted:boolean;home_score:number|null;away_score:number|null};
type UnifiedMatch=ListedMatch & {kind:"imported"|"new"};
type Match={match_id:string;original_status:string;original_home_score:number|null;original_away_score:number|null;preview_status:string;preview_home_score:number|null;preview_away_score:number|null;has_test_override:boolean};
export default function AdminTestResult() {
 const [changedIds,setChangedIds]=useState<string[]>([]);const [changedMatches,setChangedMatches]=useState<ChangedMatch[]>([]);const [ratings,setRatings]=useState<Rating[]>([]);const [overrides,setOverrides]=useState(0);const [ratingError,setRatingError]=useState("");
 const [newMatches,setNewMatches]=useState<NewMatch[]>([]);const [newId,setNewId]=useState("");const [newHome,setNewHome]=useState("0");const [newAway,setNewAway]=useState("0");
 const [matchList,setMatchList]=useState<ListedMatch[]>([]);const [listError,setListError]=useState("");
 const [search,setSearch]=useState("");const [stage,setStage]=useState("");const [tour,setTour]=useState("");const [page,setPage]=useState(1);const [onlyChanged,setOnlyChanged]=useState(false);const [statusFilter,setStatusFilter]=useState("upcoming");const [sortOrder,setSortOrder]=useState("nearest");
 const [id,setId]=useState("");const [match,setMatch]=useState<Match|null>(null);
 const [home,setHome]=useState("0");const [away,setAway]=useState("0");
 const [hp,setHp]=useState("0");const [ap,setAp]=useState("0");
 const [readonly,setReadonly]=useState(true);const [busy,setBusy]=useState(false);const [msg,setMsg]=useState("");
 async function loadRatings(){try{const r=await fetch("/api/test/admin/ratings-preview",{cache:"no-store",credentials:"same-origin"});const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка рейтинга");setRatings(d.ratings);setOverrides(d.overrides);setChangedIds(d.changedMatchIds||[]);setChangedMatches(d.changedMatches||[]);setRatingError("");}catch(e){setRatingError(e instanceof Error?e.message:"Ошибка рейтинга");}}
 async function loadNewMatches(){try{const r=await fetch("/api/test/admin/new-match-simulations",{credentials:"same-origin",cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка загрузки новых матчей");setNewMatches(d.matches||[]);}catch(e){setListError(e instanceof Error?e.message:"Ошибка новых матчей");}}
 async function updateNew(remove:boolean){if(!newId||busy)return;setBusy(true);setMsg("");try{const r=await fetch("/api/test/admin/new-match-simulations"+(remove?"?matchId="+encodeURIComponent(newId):""),{method:remove?"DELETE":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:remove?undefined:JSON.stringify({matchId:Number(newId),homeScore:Number(newHome),awayScore:Number(newAway)})});const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка сохранения");await Promise.all([loadNewMatches(),loadRatings()]);setMsg(remove?"Симуляция отменена.":"Симуляция сохранена.");}catch(e){setMsg(e instanceof Error?e.message:"Ошибка");}finally{setBusy(false);}}
 useEffect(()=>{void loadNewMatches();void loadRatings();const controller=new AbortController();fetch("/api/test/match-overview",{credentials:"same-origin",cache:"no-store",signal:controller.signal}).then(async r=>{if(!r.ok)throw Error(r.status===401?"Сессия истекла — войди заново.":"Не удалось загрузить список матчей.");return r.json();}).then(d=>{if(!controller.signal.aborted)setMatchList(d.rows||[]);}).catch(e=>{if(!controller.signal.aborted)setListError(e instanceof Error?e.message:"Ошибка списка");});return ()=>controller.abort();},[]);
 const unified=useMemo<UnifiedMatch[]>(()=>[...matchList.map(m=>({...m,kind:"imported" as const})),...newMatches.filter(m=>!m.is_deleted).map(m=>({...m,kind:"new" as const,status:m.home_score!==null?"finished":m.kickoff_at&&new Date(m.kickoff_at).getTime()<=Date.now()?"live":"scheduled"}))],[matchList,newMatches]);
 const stages=useMemo(()=>Array.from(new Set(unified.map(m=>m.stage_name).filter((x):x is string=>!!x))).sort((a,b)=>a.localeCompare(b,"ru")),[unified]);
 const tours=useMemo(()=>Array.from(new Set(unified.filter(m=>!stage||m.stage_name===stage).map(m=>m.tour_name).filter((x):x is string=>!!x))).sort((a,b)=>a.localeCompare(b,"ru")),[unified,stage]);
 const filtered=useMemo(()=>{const now=Date.now();return unified.filter(m=>(!stage||m.stage_name===stage)&&(!tour||m.tour_name===tour)&&(!search||[m.id,m.home_team,m.away_team,m.stage_name||"",m.tour_name||"",m.kind==="new"?"новый":"импортированный"].join(" ").toLocaleLowerCase("ru").includes(search.toLocaleLowerCase("ru")))&&(statusFilter==="all"||(statusFilter==="finished"?m.status==="finished":m.status==="scheduled"&&!!m.kickoff_at&&new Date(m.kickoff_at).getTime()>now))).sort((a,b)=>{const ta=a.kickoff_at?new Date(a.kickoff_at).getTime():Number.MAX_SAFE_INTEGER;const tb=b.kickoff_at?new Date(b.kickoff_at).getTime():Number.MAX_SAFE_INTEGER;return sortOrder==="latest"?tb-ta:ta-tb;});},[unified,search,stage,tour,statusFilter,sortOrder]);
 const visible=onlyChanged?filtered.filter(m=>(m.kind==="new"?m.home_score!==null:changedIds.includes(m.id))):filtered;const perPage=20;const pages=Math.max(1,Math.ceil(visible.length/perPage));const currentPage=Math.min(page,pages);
 const pageMatches=visible.slice((currentPage-1)*perPage,currentPage*perPage);
 const dateLabel=(value:string|null)=>value?new Date(value).toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow"}):"—";
 const statusLabel=(value:string)=>value==="finished"?"Завершён":value==="scheduled"?"Запланирован":value==="live"?"Идёт":value;
 const overrideScore=(id:string)=>changedMatches.find(x=>x.id===id);
 const canEnterResult=(m:ListedMatch)=>!!m.kickoff_at&&new Date(m.kickoff_at).getTime()<=Date.now();
 const errorText=(error:string)=>error==="match_not_started_or_missing"?"Нельзя сохранить результат до начала матча.":error==="forbidden"?"Нет прав администратора или сессия истекла.":error==="writes_disabled"?"Запись тестовых результатов отключена.":error==="invalid_result"?"Проверь введённый счёт.":error;
 const label=(m:ListedMatch)=>`${m.kickoff_at?new Date(m.kickoff_at).toLocaleDateString("ru-RU",{timeZone:"Europe/Moscow"}):"Без даты"} · ${m.home_team} — ${m.away_team} · ${m.stage_name||"—"} / ${m.tour_name||"—"} · #${m.id}`;
 async function load(matchId:string) {
  setBusy(true);setMsg("");setMatch(null);
  try {
   const r=await fetch("/api/test/admin/result-draft?matchId="+encodeURIComponent(matchId),{cache:"no-store",credentials:"same-origin"});
   const d=await r.json();if(!r.ok)throw Error(d.error||"Не удалось загрузить матч");
   setMatch(d.match);setId(matchId);setReadonly(d.readonly);
   setHome(String(d.match.preview_home_score??0));setAway(String(d.match.preview_away_score??0));setHp("0");setAp("0");
  }catch(e){setMsg(e instanceof Error?e.message:"Ошибка");}
  finally{setBusy(false);}
 }
 async function update(method:"POST"|"DELETE") {
  if(!match||readonly)return;
  const currentMatch=matchList.find(m=>m.id===match.match_id);
  if(method==="POST"&&(!currentMatch||!canEnterResult(currentMatch))){setMsg("Нельзя сохранить результат до начала матча.");return;}
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
   const r=await fetch(url,options);const d=await r.json();if(!r.ok)throw Error(errorText(d.error||"Ошибка сохранения"));
   await load(match.match_id);await loadRatings();setMsg(method==="POST"?"Тестовый результат сохранён.":"Тестовый результат удалён.");
  }catch(e){setMsg(e instanceof Error?e.message:"Ошибка");}
  finally{setBusy(false);}
 }
 return <main style={{maxWidth:1130,margin:"35px auto",padding:20}}>
  <h1>Тестовый ввод результатов — ADMIN</h1>
  <p>Изолированная Neon. Импортированные матчи и рабочий Footy не изменяются.</p>
  <p><a href="/test-match-overview">← Список матчей</a> · <a href="/test-admin-new-match-results">Симуляция новых матчей →</a></p>
  <section style={{display:"none"}}><h2>Новые тестовые матчи — симуляция результата</h2><p>Результаты можно моделировать до начала матча. Рабочие результаты не изменяются.</p><label>Матч <select value={newId} onChange={e=>{const id=e.target.value;const m=newMatches.find(x=>x.id===id);setNewId(id);setNewHome(String(m?.home_score??0));setNewAway(String(m?.away_score??0));}}><option value="">Выбери новый матч</option>{newMatches.filter(x=>!x.is_deleted).map(x=><option key={x.id} value={x.id}>T-{x.id} · {x.home_team} — {x.away_team} · {x.stage_name||"—"} / {x.tour_name||"—"}</option>)}</select></label>{newId&&<div style={{marginTop:12}}><p>Текущая симуляция: {(()=>{const x=newMatches.find(m=>m.id===newId);return x?.home_score==null?"не задана":`${x.home_score} : ${x.away_score}`;})()}</p><label>Хозяева <input type="number" min={0} max={30} value={newHome} onChange={e=>setNewHome(e.target.value)}/></label>{" : "}<label>Гости <input type="number" min={0} max={30} value={newAway} onChange={e=>setNewAway(e.target.value)}/></label><div style={{display:"flex",gap:10,marginTop:12}}><button type="button" disabled={busy||!/^(?:[0-9]|[12][0-9]|30)$/.test(newHome)||!/^(?:[0-9]|[12][0-9]|30)$/.test(newAway)} onClick={()=>void updateNew(false)}>Сохранить симуляцию</button><button type="button" disabled={busy||newMatches.find(x=>x.id===newId)?.home_score==null} onClick={()=>void updateNew(true)}>Отменить симуляцию</button></div></div>}</section>
  <section style={{margin:"20px 0"}}>
   <h2>Все матчи — редактирование результатов</h2><p>Новые и импортированные матчи в одном списке. Новые допускают симуляцию до начала игры; импортированные — только после начала.</p>
   <div style={{display:"flex",flexWrap:"wrap",gap:12,marginBottom:14,alignItems:"end"}}>
    <label>Этап <select value={stage} onChange={e=>{setStage(e.target.value);setTour("");setPage(1);}}><option value="">Все этапы</option>{stages.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>Тур <select value={tour} onChange={e=>{setTour(e.target.value);setPage(1);}}><option value="">Все туры</option>{tours.map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label>Статус <select value={statusFilter} onChange={e=>{setStatusFilter(e.target.value);setPage(1);setMatch(null);}}><option value="upcoming">Предстоящие</option><option value="finished">Завершённые</option><option value="all">Все</option></select></label>
    <label>Сортировка <select value={sortOrder} onChange={e=>{setSortOrder(e.target.value);setPage(1);setMatch(null);}}><option value="nearest">Сначала ранние</option><option value="latest">Сначала поздние</option></select></label>
    <label>Поиск <input value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} placeholder="Команда или ID" style={{padding:7}}/></label>
    <label><input type="checkbox" checked={onlyChanged} onChange={e=>{setOnlyChanged(e.target.checked);setPage(1);setMatch(null);}}/> Только изменённые ({changedIds.length+newMatches.filter(x=>!x.is_deleted&&x.home_score!==null).length})</label>
   </div>
   <p>Найдено матчей: {visible.length}. Страница {currentPage} из {pages}.</p>
   {listError&&<p role="alert">{listError}</p>}
   <div style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:1100}}>
     <thead><tr><th>Дата (МСК)</th><th>Матч</th><th>Этап / тур</th><th>Статус</th><th>Исходный счёт</th><th>Тестовый счёт</th><th>Действие</th></tr></thead>
     <tbody>{pageMatches.map(m=><tr key={m.id}><td colSpan={7} style={{padding:0,borderBottom:"1px solid #d0d7e2"}}>
      <div style={{display:"grid",gridTemplateColumns:"110px minmax(190px,2fr) minmax(190px,1.5fr) 120px 105px 110px 120px",gap:14,alignItems:"center",padding:"10px 5px",background:(m.kind==="new"?m.home_score!==null:changedIds.includes(m.id))?"#fff4db":"transparent"}}>
       <span>{dateLabel(m.kickoff_at)}</span>
       <span><strong>{m.home_team} — {m.away_team}</strong><small style={{display:"block"}}>#{m.id} · {m.kind==="new"?"Новый":"Импортированный"} {(m.kind==="new"?m.home_score!==null:changedIds.includes(m.id))?"· Тестовый результат изменён":""}</small></span>
       <span>{m.stage_name||"—"} / {m.tour_name||"—"}</span>
       <span>{statusLabel(m.status)}</span>
       <span>{m.kind==="new"?"—":m.home_score===null||m.away_score===null?"—":m.home_score+" : "+m.away_score}</span>
       <span style={{fontWeight:changedIds.includes(m.id)?700:400}}>{m.kind==="new"?(m.home_score===null?"—":`${m.home_score} : ${m.away_score}`):overrideScore(m.id)?`${overrideScore(m.id)!.home_score} : ${overrideScore(m.id)!.away_score}`:m.home_score===null||m.away_score===null?"—":`${m.home_score} : ${m.away_score}`}</span>
       <button type="button" disabled={busy} onClick={()=>{if(m.kind==="new"){setMatch(null);if(newId===m.id){setNewId("");return;}setNewId(m.id);setNewHome(String(m.home_score??0));setNewAway(String(m.away_score??0));return;}setNewId("");if(match?.match_id===m.id){setMatch(null);return;}void load(m.id);}}>{(m.kind==="new"?newId===m.id:match?.match_id===m.id)?"Закрыть":"Редактировать"}</button>
      </div>
      {m.kind==="new"&&newId===m.id&&<section style={{padding:16,border:"1px solid #d0d7e2",borderRadius:10,margin:"8px 0 14px"}}><h3>Новый матч T-{m.id}: {m.home_team} — {m.away_team}</h3><p>Текущая симуляция: {m.home_score===null?"не задана":`${m.home_score} : ${m.away_score}`}</p><label>Хозяева <input type="number" min={0} max={30} value={newHome} onChange={e=>setNewHome(e.target.value)}/></label>{" : "}<label>Гости <input type="number" min={0} max={30} value={newAway} onChange={e=>setNewAway(e.target.value)}/></label><div style={{display:"flex",gap:10,marginTop:12}}><button type="button" disabled={busy||!/^(?:[0-9]|[12][0-9]|30)$/.test(newHome)||!/^(?:[0-9]|[12][0-9]|30)$/.test(newAway)} onClick={()=>void updateNew(false)}>Сохранить симуляцию</button><button type="button" disabled={busy||m.home_score===null} onClick={()=>void updateNew(true)}>Отменить симуляцию</button></div></section>}
      {m.kind==="imported"&&match&&match.match_id===m.id&&<section style={{border:"1px solid #d0d7e2",borderRadius:10,padding:16,maxWidth:760,margin:"8px 0 14px"}}>
   <h3>{m.home_team} — {m.away_team} · матч #{match.match_id}</h3>
   <p>Исходный статус: {statusLabel(match.original_status)}. Исходный счёт: {match.original_home_score??"—"} : {match.original_away_score??"—"}.</p>
   <p>Тестовый счёт: {match.preview_home_score??"—"} : {match.preview_away_score??"—"}; {match.has_test_override?"изменён":"совпадает с исходным"}.</p>
   {readonly?<p><strong>Запись выключена.</strong> Для неё нужен отдельный переключатель в тестовом контейнере.</p>:<>
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(110px,145px))",gap:10}}>
     {([["Голы хозяев",home,setHome],["Голы гостей",away,setAway],["С пенальти хозяев",hp,setHp],["С пенальти гостей",ap,setAp]] as const).map(([label,value,setter])=><label key={label}>{label}<input type="number" required min={0} max={30} step={1} value={value} onChange={e=>setter(e.target.value)} style={{display:"block",width:"100%",maxWidth:105,padding:7}}/></label>)}
    </div>
    {!canEnterResult(m)&&<p style={{color:"#855700",marginTop:12}}>Сохранение станет доступно после начала матча{m.kickoff_at?` (${new Date(m.kickoff_at).toLocaleString("ru-RU",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Moscow"})} МСК)`:"; время начала не задано"}.</p>}
    <div style={{display:"flex",gap:12,marginTop:18,flexWrap:"wrap"}}>
     <button type="button" disabled={busy||!canEnterResult(m)} onClick={()=>void update("POST")}>Сохранить только тестовый результат</button>
     {match.has_test_override&&<button type="button" disabled={busy} onClick={()=>void update("DELETE")}>Отменить тестовый результат</button>}
    </div>
   </>}
  </section>}
     </td></tr>)}</tbody>
    </table>
   </div>
   <div style={{display:"flex",gap:12,alignItems:"center",marginTop:15}}>
    <button type="button" disabled={currentPage<=1} onClick={()=>{setPage(p=>Math.max(1,p-1));setMatch(null);}}>← Назад</button>
    <span>{currentPage} / {pages}</span>
    <button type="button" disabled={currentPage>=pages} onClick={()=>{setPage(p=>Math.min(pages,p+1));setMatch(null);}}>Далее →</button>
   </div>
  </section>
  <p role="status">{msg}</p>
  <section style={{marginTop:28,border:"1px solid #d0d7e2",borderRadius:10,padding:18}}>
   <h2>Рейтинг: исходный и тестовый</h2>
   <p>Изменено импортированных матчей: {overrides}; симуляций новых матчей: {newMatches.filter(x=>!x.is_deleted&&x.home_score!==null).length}. Рейтинг включает симуляции новых матчей. Рабочие начисления не изменяются.</p>
   <button type="button" onClick={()=>void loadRatings()}>Обновить рейтинг</button>
   {ratingError&&<p role="alert">{ratingError}</p>}
   <div style={{overflowX:"auto",marginTop:12,maxWidth:650}}><table style={{borderCollapse:"collapse",width:"100%",textAlign:"right"}}>
    <thead><tr><th style={{textAlign:"left"}}>Участник</th><th>Исходный</th><th>Новые матчи</th><th>Тестовый</th><th>Разница</th></tr></thead>
    <tbody>{ratings.map(x=><tr key={x.username}><td style={{textAlign:"left",padding:"8px 4px"}}>{x.username}</td><td>{x.original_points}</td><td>{x.new_match_points}</td><td>{x.preview_points}</td><td style={{color:Number(x.delta)>0?"green":Number(x.delta)<0?"#b42318":"inherit"}}>{Number(x.delta)>0?"+":""}{x.delta}</td></tr>)}</tbody>
   </table></div>
  </section>
 </main>;
}
