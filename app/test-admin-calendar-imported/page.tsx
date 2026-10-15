"use client";
import {useEffect,useState} from "react";
type Match={id:string;stage_id:string;tour_id:string;home_team_id:string;away_team_id:string;kickoff_at:string;deadline_at:string;status:string;home_team:string;away_team:string;stage_name:string;tour_name:string;stage_status:string};
type Draft={match_id:string;stage_id:string;tour_id:string;home_team_id:string;away_team_id:string;kickoff_at:string;deadline_at:string;status:string;is_deleted:boolean};
type Stage={id:string;name:string;status:string};type Tour={id:string;stage_id:string;name:string|null;tour_no:string};type Team={id:string;name:string};
const localDate=(s:string)=>{const d=new Date(s);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16);};
const fmt=(s:string)=>new Date(s).toLocaleString("ru-RU",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Moscow"})+" МСК";
const explain=(x:string)=>({conflict_or_locked_stage:"Изменение отклонено: этап заблокирован, команды заняты или тур не соответствует этапу.",forbidden:"Нет доступа ADMIN. Войди заново.",invalid_match:"Некорректные данные матча.",deadline_after_kickoff:"Окончание прогнозов позже начала матча.",writes_disabled:"Запись тестового календаря отключена."} as Record<string,string>)[x]||x;
export default function ImportedMatchEditor(){
 const [id,setId]=useState("404"),[original,setOriginal]=useState<Match|null>(null),[draft,setDraft]=useState<Draft|null>(null),[stages,setStages]=useState<Stage[]>([]),[tours,setTours]=useState<Tour[]>([]),[teams,setTeams]=useState<Team[]>([]);
 const [stage,setStage]=useState(""),[tour,setTour]=useState(""),[home,setHome]=useState(""),[away,setAway]=useState(""),[kickoff,setKickoff]=useState(""),[deadline,setDeadline]=useState(""),[deleted,setDeleted]=useState(false),[readonly,setReadonly]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
 const teamName=(key:string)=>teams.find(t=>t.id===key)?.name||key;
 async function load(matchId:string){
  setBusy(true);setMessage("");
  try{
   const [mr,cr]=await Promise.all([fetch("/api/test/admin/calendar-imported?matchId="+encodeURIComponent(matchId),{cache:"no-store"}),fetch("/api/test/admin/calendar",{cache:"no-store"})]);
   const m=await mr.json(),c=await cr.json();if(!mr.ok)throw Error(explain(m.error||"Ошибка матча"));if(!cr.ok)throw Error(explain(c.error||"Ошибка справочников"));
   setOriginal(m.original);setDraft(m.draft);setReadonly(m.readonly);setStages(c.stages);setTours(c.tours);setTeams(c.teams);
   const x=m.draft||m.original;setStage(x.stage_id);setTour(x.tour_id);setHome(x.home_team_id);setAway(x.away_team_id);setKickoff(localDate(x.kickoff_at));setDeadline(localDate(x.deadline_at));setDeleted(!!m.draft?.is_deleted);
  }catch(e){setOriginal(null);setMessage(e instanceof Error?e.message:"Ошибка загрузки");}finally{setBusy(false);}
 }
 useEffect(()=>{void load("404");},[]);
 async function save(reset:boolean){
  if(!original||busy||readonly)return;
  if(reset&&!window.confirm("Отменить тестовые изменения и вернуть исходные значения?"))return;
  setBusy(true);setMessage("");
  try{
   const url="/api/test/admin/calendar-imported";
   const r=await fetch(reset?url+"?matchId="+encodeURIComponent(original.id):url,{method:reset?"DELETE":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},...(reset?{}:{body:JSON.stringify({matchId:Number(original.id),stageId:Number(stage),tourId:Number(tour),homeTeamId:Number(home),awayTeamId:Number(away),kickoffAt:new Date(kickoff).toISOString(),deadlineAt:new Date(deadline).toISOString(),isDeleted:deleted})})});
   const v=await r.json();if(!r.ok)throw Error(explain(v.error||"Ошибка сохранения"));await load(original.id);setMessage(reset?"Тестовые изменения отменены.":"Тестовый черновик сохранён.");
  }catch(e){setMessage(e instanceof Error?e.message:"Ошибка");}finally{setBusy(false);}
 }
 return <main style={{maxWidth:960,margin:"35px auto",padding:20}}>
  <h1>Редактирование импортированного матча — ADMIN</h1>
  <p>Все изменения — только в footy_sandbox. Исходный матч и прогнозы участников не меняются.</p>
  <p><a href="/test-admin-calendar">← Тестовый календарь</a></p>
  <div style={{display:"flex",gap:10}}><label>Номер исходного матча <input value={id} onChange={e=>setId(e.target.value)} style={{width:90}}/></label><button disabled={busy||!/^\d+$/.test(id)} onClick={()=>void load(id)}>Загрузить</button></div>
  {original&&<>
   <h2>{original.home_team} — {original.away_team} · #{original.id}</h2>
   <table style={{borderCollapse:"collapse",width:"100%",maxWidth:730}}><thead><tr><th style={{textAlign:"left"}}>Параметр</th><th>Исходный</th><th>Тестовый</th></tr></thead><tbody>
   <tr><td>Этап</td><td>{original.stage_name}</td><td>{stages.find(x=>x.id===stage)?.name||stage}</td></tr>
   <tr><td>Тур</td><td>{original.tour_name}</td><td>{tours.find(x=>x.id===tour)?.name||tour}</td></tr>
   <tr><td>Хозяева</td><td>{original.home_team}</td><td>{teamName(home)}</td></tr>
   <tr><td>Гости</td><td>{original.away_team}</td><td>{teamName(away)}</td></tr>
   <tr><td>Начало</td><td>{fmt(original.kickoff_at)}</td><td>{kickoff?fmt(new Date(kickoff).toISOString()):"—"}</td></tr>
   <tr><td>Дедлайн</td><td>{fmt(original.deadline_at)}</td><td>{deadline?fmt(new Date(deadline).toISOString()):"—"}</td></tr>
   <tr><td>Скрыт</td><td>Нет</td><td>{deleted?"Да":"Нет"}</td></tr>
   </tbody></table>
   <p>{draft?"Существует тестовый черновик.":"Изменений ещё нет."} Исходный этап: {original.stage_status}.</p>
   <section style={{display:"grid",gap:10,maxWidth:580}}>
    <label>Этап <select disabled value={stage} style={{display:"block",width:"100%"}}><option value={stage}>{stages.find(x=>x.id===stage)?.name||stage}</option></select></label>
    <label>Тур <select value={tour} onChange={e=>setTour(e.target.value)} style={{display:"block",width:"100%"}}>{tours.filter(t=>t.stage_id===stage).map(t=><option key={t.id} value={t.id}>{t.name||t.tour_no} (#{t.id})</option>)}</select></label>
    <label>Хозяева <select value={home} onChange={e=>setHome(e.target.value)} style={{display:"block",width:"100%"}}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Гости <select value={away} onChange={e=>setAway(e.target.value)} style={{display:"block",width:"100%"}}>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Начало (местное время браузера) <input type="datetime-local" value={kickoff} onChange={e=>setKickoff(e.target.value)} /></label>
    <label>Приём прогнозов до (местное время браузера) <input type="datetime-local" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>
    <label><input type="checkbox" checked={deleted} onChange={e=>setDeleted(e.target.checked)}/> Скрыть только в тестовом календаре</label>
    <div style={{display:"flex",gap:10}}><button disabled={busy||readonly||!kickoff||!deadline||home===away} onClick={()=>void save(false)}>Сохранить тестовые изменения</button><button disabled={busy||readonly||!draft} onClick={()=>void save(true)}>Отменить черновик</button></div>
   </section>
  </>}
  <p role="status">{message}</p>
 </main>;
}
