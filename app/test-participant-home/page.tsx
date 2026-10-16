"use client";
import {useEffect,useMemo,useState} from "react";
type Stage={id:string;name:string;is_current:boolean;match_count:number;predicted_count:number;upcoming_count:number};
type Match={source:string;display_id:string;stage_id:string;tour_id:string;home_team:string;away_team:string;kickoff_at:string;deadline_at:string;my_home_pred:number|null;my_away_pred:number|null;my_prediction_source:string;prediction_editable:boolean};
export default function ParticipantHome(){
 const [username,setUsername]=useState(""),[stages,setStages]=useState<Stage[]>([]),[matches,setMatches]=useState<Match[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState("");
 useEffect(()=>{let active=true;(async()=>{
 const results=await Promise.all([fetch("/api/test/participant-session",{cache:"no-store"}),fetch("/api/test/participant-competitions",{cache:"no-store"}),fetch("/api/test/participant-calendar",{cache:"no-store"})]);
 const data=await Promise.all(results.map(r=>r.json()));
 if(results.some(r=>r.status===401)||!data[0]?.authenticated){window.location.replace("/test-participant-login?next="+encodeURIComponent("/test-participant-home"));return;}
 const idx=results.findIndex(r=>!r.ok);if(idx>=0)throw Error(data[idx]?.error||"Не удалось загрузить кабинет");
 if(!active)return;setUsername(data[0].username);setStages(data[1].stages||[]);setMatches(data[2].rows||[]);
 })().catch(e=>{if(active)setError(e instanceof Error?e.message:"Ошибка загрузки");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[]);
 const current=stages.find(s=>s.is_current);
 const upcoming=useMemo(()=>matches.filter(m=>m.stage_id===current?.id&&new Date(m.kickoff_at).getTime()>Date.now()&&m.prediction_editable).slice(0,8),[matches,current]);
 const missing=upcoming.filter(m=>m.my_prediction_source==="none").length;
 const stamp=(v:string)=>new Date(v).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})+" МСК";
 return <main className="home"><header><h1>Footy · кабинет участника</h1><p>{username?"Участник: "+username:"Тестовая площадка Neon"} · рабочий конкурс не изменяется</p></header>
 <nav><a href="/test-participant-competitions">Этапы и туры</a><a href="/test-participant-calendar">Матчи и прогнозы</a><a href="/test-participant-current-table">Текущая таблица</a><a href="/test-rating-effective">Рейтинг</a><a href="/test-participant-ratings">Рейтинги по этапам</a></nav>
 {loading&&<p>Загружаю кабинет…</p>}{error&&<p role="alert">{error}</p>}
 {!loading&&!error&&<><section className="summary"><h2>{current?.name||"Текущий этап не назначен"}</h2>{current&&<div className="stats"><div><strong>{current.match_count}</strong><span>Матчей в этапе</span></div><div><strong>{current.predicted_count}</strong><span>Прогнозов сделано</span></div><div><strong>{current.upcoming_count}</strong><span>Предстоящих матчей</span></div></div>}</section>
 <section><h2>Ближайшие матчи текущего этапа</h2><p className="hint">Показаны ближайшие {upcoming.length} матча(-ей), из них без прогноза: {missing}.</p>
 {upcoming.map(m=><a className="match" key={m.source+":"+m.display_id} href={"/test-participant-calendar?tour="+encodeURIComponent(m.tour_id)}><div><div className="date">{stamp(m.kickoff_at)} · №{m.display_id}</div><strong>{m.home_team} — {m.away_team}</strong><div className="date">Приём до: {stamp(m.deadline_at)}</div></div><div className="prediction">{m.my_prediction_source==="none"?"Нет прогноза":m.my_home_pred+":"+m.my_away_pred}<span>{m.my_prediction_source==="test"?"Тестовый прогноз":m.my_prediction_source==="imported"?"Исходный прогноз":"Открыть тур →"}</span></div></a>)}
 {upcoming.length===0&&<p>Ближайших доступных матчей пока нет.</p>}
 <p><a href="/test-participant-competitions">Все этапы и туры →</a></p></section></>}
 <style jsx>{`.home{max-width:1020px;margin:32px auto;padding:0 18px 44px;color:#18283f}h1{font-size:30px;margin-bottom:3px}header p,.hint,.date{color:#64748b}nav{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0 28px}nav a{padding:10px 12px;border:1px solid #cbd9ed;border-radius:9px;text-decoration:none;background:#f5f8fe}section{margin-top:24px}h2{font-size:21px}.summary{border:1px solid #c8d9f1;background:#f3f7ff;border-radius:14px;padding:18px}.summary h2{margin-top:0}.stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.stats div{display:grid;gap:5px;background:white;padding:13px;border-radius:10px}.stats strong{font-size:26px}.stats span{color:#64748b;font-size:12px}.match{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:14px 16px;margin:9px 0;border:1px solid #d7e1ef;border-radius:11px;text-decoration:none;color:inherit;background:white}.date{font-size:12px;margin:5px 0}.prediction{font-weight:700;text-align:right;white-space:nowrap}.prediction span{display:block;font-weight:400;font-size:12px;color:#60718b;margin-top:5px}@media(max-width:600px){.home{margin:20px auto;padding:0 12px}h1{font-size:24px}.stats{grid-template-columns:1fr}.match{align-items:flex-start}.prediction{white-space:normal}}`}</style></main>;
}