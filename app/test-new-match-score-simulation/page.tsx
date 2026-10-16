"use client";
import {useEffect,useState} from "react";
type Score={username:string;home_pred:number;away_pred:number;points:number;points_outcome:number;points_diff:number;points_h1:number;points_h2:number;points_bonus:number};
export default function Simulation(){
 const [home,setHome]=useState("2"),[away,setAway]=useState("1"),[data,setData]=useState<{rows:Score[];match:{home_team:string;away_team:string;status:string}}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 async function check(h=home,a=away){
  if(!/^\d+$/.test(h)||!/^\d+$/.test(a)||Number(h)>30||Number(a)>30){setError("Введи целый счёт от 0 до 30");return;}
  setBusy(true);setError("");
  try{const r=await fetch("/api/test/new-match-score-simulation?matchId=1&home="+h+"&away="+a,{credentials:"same-origin",cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error);setData(d);}catch(e){setError(e instanceof Error?e.message:"Ошибка");}finally{setBusy(false);}
 }
 useEffect(()=>{void check("2","1");},[]);
 return <main style={{maxWidth:820,margin:"32px auto",padding:20}}>
 <h1>Предварительный расчёт T-1</h1><p>Arsenal — Barcelona. Это только моделирование результата: матч остаётся предстоящим, дедлайн и рейтинг не изменяются.</p>
 <p><a href="/test-rating-effective">← Тестовый рейтинг</a></p>
 <div style={{display:"flex",alignItems:"end",gap:12,flexWrap:"wrap",margin:"24px 0"}}>
 <label>Голы Arsenal<input aria-label="Голы Arsenal" type="number" min={0} max={30} value={home} onChange={e=>setHome(e.target.value)} style={{display:"block",width:85,padding:9}}/></label>
 <label>Голы Barcelona<input aria-label="Голы Barcelona" type="number" min={0} max={30} value={away} onChange={e=>setAway(e.target.value)} style={{display:"block",width:85,padding:9}}/></label>
 <button disabled={busy} onClick={()=>void check()} style={{padding:10}}>Рассчитать</button></div>
 {error&&<p role="alert">{error}</p>}
 {data&&<div style={{overflowX:"auto"}}><table style={{borderCollapse:"collapse",width:"100%",minWidth:600,textAlign:"left"}}><thead><tr><th>Участник</th><th>Прогноз</th><th>Исход</th><th>Разница</th><th>Голы</th><th>Бонус</th><th>Всего</th></tr></thead><tbody>{data.rows.map(r=><tr key={r.username} style={{borderTop:"1px solid #ccd6e3"}}><td style={{padding:"12px 4px"}}>{r.username}</td><td>{r.home_pred}:{r.away_pred}</td><td>{r.points_outcome.toFixed(2)}</td><td>{r.points_diff.toFixed(2)}</td><td>{(r.points_h1+r.points_h2).toFixed(2)}</td><td>{r.points_bonus.toFixed(2)}</td><td><strong>{r.points.toFixed(2)}</strong></td></tr>)}</tbody></table></div>}
 <p style={{marginTop:20,color:"#64748b"}}>Результат вводится только для расчёта и не записывается в Neon.</p>
 </main>;
}