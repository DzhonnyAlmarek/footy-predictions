"use client";
import {useEffect,useMemo,useState} from "react";
type Stage={id:string;name:string;status:string;is_current:boolean;match_count:number;upcoming_count:number;predicted_count:number};
type Tour={id:string;stage_id:string;tour_no:string;name:string|null;match_count:number;upcoming_count:number;predicted_count:number};
export default function ParticipantCompetitions(){
 const [stages,setStages]=useState<Stage[]>([]),[tours,setTours]=useState<Tour[]>([]),[selected,setSelected]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/test/participant-competitions",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла — войди заново":d.error||"Ошибка загрузки");const a:Stage[]=d.stages||[];setStages(a);setTours(d.tours||[]);setSelected(a.find(x=>x.is_current)?.id||a[0]?.id||"");}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const stage=stages.find(s=>s.id===selected);const items=useMemo(()=>tours.filter(t=>t.stage_id===selected),[tours,selected]);
 return <main style={{maxWidth:900,margin:"30px auto",padding:"0 18px 40px"}}>
 <h1>Соревнования и туры</h1><p>Участник · изолированная площадка Neon. Здесь показаны только опубликованные и завершённые этапы. Тестовые черновики доступны отдельно.</p>
 <nav style={{display:"flex",gap:15,flexWrap:"wrap"}}><a href="/test-participant-calendar">Все матчи и прогнозы</a><a href="/test-rating-effective">Рейтинг</a><a href="/test-participant-predictions">Мои исходные прогнозы</a></nav>
 {loading&&<p>Загрузка…</p>}{error&&<p role="alert">{error}</p>}
 {!loading&&!error&&<><h2 style={{marginTop:28}}>Этапы</h2><div style={{display:"grid",gap:8}}>
 {stages.map(s=><button key={s.id} onClick={()=>setSelected(s.id)} style={{textAlign:"left",padding:14,borderRadius:10,border:selected===s.id?"2px solid #446bad":"1px solid #cdd9e8",background:selected===s.id?"#f1f6ff":"white",cursor:"pointer"}}>
 <strong>{s.name}</strong> {s.is_current&&<span style={{fontSize:12,color:"#245e9c"}}>· Текущий</span>}
 <div style={{color:"#68778c",fontSize:13,marginTop:5}}>Матчей: {s.match_count} · Прогнозов: {s.predicted_count} · Впереди: {s.upcoming_count}</div></button>)}</div>
 {stage&&<><h2 style={{marginTop:26}}>Туры: {stage.name}</h2><div style={{display:"grid",gap:10}}>{items.map(t=><a key={t.id} href={"/test-participant-calendar?tour="+encodeURIComponent(t.id)} style={{display:"block",textDecoration:"none",color:"#142239",border:"1px solid #d6e0ed",borderRadius:10,padding:14,background:"white"}}>
 <strong>{t.name||"Тур "+t.tour_no}</strong><div style={{fontSize:13,marginTop:5,color:"#65748a"}}>Матчей: {t.match_count} · Прогнозов: {t.predicted_count} · Впереди: {t.upcoming_count}</div><span style={{fontSize:13,color:"#295a9b"}}>Открыть матчи →</span></a>)}</div></>}
 </>}
 <p style={{fontSize:13,marginTop:26,color:"#718096"}}>Навигация тестовая. Рабочий Footy и Supabase не изменяются.</p>
 </main>;
}