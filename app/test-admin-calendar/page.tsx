"use client";
import {useEffect,useMemo,useState} from "react";
type Stage={id:string;name:string;status:string};type Tour={id:string;stage_id:string;tour_no:string;name:string|null};type Team={id:string;name:string};type Draft={draft_id:string;stage_id:string;tour_id:string;home_team_id:string;away_team_id:string;kickoff_at:string;is_deleted:boolean};
type Data={readonly:boolean;writeEnabled:boolean;stages:Stage[];tours:Tour[];teams:Team[];newDrafts:Draft[]};
const explain=(s:string)=>({stage_tour_team_conflict_or_not_draft:"Нельзя создать матч: проверь этап, тур и участие команд в этом туре.",deadline_after_kickoff:"Приём прогнозов должен завершаться не позднее начала матча.",invalid_match:"Проверь обязательные поля и даты.",writes_disabled:"Запись календаря отключена.",forbidden:"Нет доступа ADMIN."} as Record<string,string>)[s]||s;
export default function AdminCalendar(){
 const [data,setData]=useState<Data|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [stage,setStage]=useState(""),[tour,setTour]=useState(""),[home,setHome]=useState(""),[away,setAway]=useState(""),[kickoff,setKickoff]=useState(""),[deadline,setDeadline]=useState("");
 async function reload(){const r=await fetch("/api/test/admin/calendar",{cache:"no-store",credentials:"same-origin"});const d=await r.json();if(!r.ok)throw Error(explain(d.error||"Ошибка загрузки"));setData(d);}
 useEffect(()=>{void reload().catch(e=>setMessage(String(e.message||e)));},[]);
 const availableStages=useMemo(()=>data?.stages.filter(s=>s.status==="draft")||[],[data]);
 const tours=useMemo(()=>data?.tours.filter(t=>t.stage_id===stage)||[],[data,stage]);
 const teams=data?.teams||[];
 const name=(id:string)=>teams.find(x=>x.id===id)?.name||"#"+id;
 const canSave=!!data?.writeEnabled&&!busy&&!!stage&&!!tour&&!!home&&!!away&&home!==away&&!!kickoff&&!!deadline;
 async function save(e:React.FormEvent){e.preventDefault();if(!canSave)return;setBusy(true);setMessage("");try{
  const r=await fetch("/api/test/admin/calendar",{method:"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:JSON.stringify({stageId:Number(stage),tourId:Number(tour),homeTeamId:Number(home),awayTeamId:Number(away),kickoffAt:new Date(kickoff).toISOString(),deadlineAt:new Date(deadline).toISOString()})});
  const d=await r.json();if(!r.ok)throw Error(explain(d.error||"Ошибка сохранения"));setMessage("Создан только тестовый черновик №"+d.draftId);await reload();
 }catch(err){setMessage(err instanceof Error?err.message:"Ошибка");}finally{setBusy(false);}}
 return <main style={{maxWidth:970,margin:"35px auto",padding:20}}>
  <h1>Тестовый календарь — ADMIN</h1>
  <p>Изолированная Neon. Исходные матчи и рабочий сайт не изменяются.</p>
  <p><a href="/test-admin-results">← Тестовые результаты</a></p>
  <h2>Создать черновик матча</h2>
  {!data?<p>Загрузка справочников...</p>:<p>{data.writeEnabled?"Запись разрешена только в тестовый календарь.":"Запись отключена: нужен отдельный флаг ENABLE_NEON_TEST_CALENDAR_WRITES."}</p>}
  <form onSubmit={e=>void save(e)} style={{display:"grid",gap:12,maxWidth:580}}>
   <label>Этап <select value={stage} onChange={e=>{setStage(e.target.value);setTour("");}} required style={{display:"block",width:"100%"}}><option value="">Выбери этап</option>{availableStages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
   <label>Тур <select value={tour} onChange={e=>setTour(e.target.value)} required style={{display:"block",width:"100%"}}><option value="">Выбери тур</option>{tours.map(t=><option key={t.id} value={t.id}>{t.name||t.tour_no} (#{t.id})</option>)}</select></label>
   <label>Хозяева <select value={home} onChange={e=>setHome(e.target.value)} required style={{display:"block",width:"100%"}}><option value="">Выбери команду</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label>Гости <select value={away} onChange={e=>setAway(e.target.value)} required style={{display:"block",width:"100%"}}><option value="">Выбери команду</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
   <label>Начало матча (местное время браузера) <input type="datetime-local" value={kickoff} onChange={e=>setKickoff(e.target.value)} required style={{display:"block"}}/></label>
   <label>Окончание приёма прогнозов (местное время браузера) <input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)} required style={{display:"block"}}/></label>
   <button type="submit" disabled={!canSave}>{busy?"Сохраняем...":"Создать только тестовый матч"}</button>
  </form>
  <p role="status">{message}</p>
  <h2>Тестовые черновики ({data?.newDrafts.length||0})</h2>
  {data?.newDrafts.map(d=><p key={d.draft_id}>#{d.draft_id} · {name(d.home_team_id)} — {name(d.away_team_id)} · {new Date(d.kickoff_at).toLocaleString("ru-RU",{timeZone:"Europe/Moscow"})} МСК {d.is_deleted?"· удалён":""}</p>)}
 </main>;
}
