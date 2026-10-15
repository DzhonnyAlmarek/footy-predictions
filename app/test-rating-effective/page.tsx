"use client";
import {useEffect,useState} from "react";
type Row={user_id:string;username:string;original_points:string;test_delta:string;effective_points:string};
export default function RatingEffective(){
 const [rows,setRows]=useState<Row[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/test/rating-effective",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла — войди заново":d.error||"Ошибка");setRows(d.rows||[]);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const signed=(n:string)=>Number(n)>0?"+"+n:n;
 return <main style={{maxWidth:780,margin:"32px auto",padding:20}}>
 <h1>Тестовый рейтинг Footy</h1>
 <p>Сравнение исходных очков с расчётом, учитывающим тестовые прогнозы и результаты. Рабочие очки не меняются.</p>
 <p><a href="/test-participant-calendar">← Расписание и прогнозы</a></p>
 {loading&&<p>Загрузка...</p>}{error&&<p role="alert">{error}</p>}
 {!loading&&!error&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:490,textAlign:"left"}}>
 <thead><tr><th style={{padding:12}}>Место</th><th>Участник</th><th>Исходные очки</th><th>Разница</th><th>Тестовый итог</th></tr></thead>
 <tbody>{rows.map((r,i)=><tr key={r.username} style={{borderTop:"1px solid #d7dfe8"}}><td style={{padding:12}}>{i+1}</td><td><a href={'/test-rating-details?user='+encodeURIComponent(r.user_id)}>{r.username}</a></td><td>{r.original_points}</td><td>{signed(r.test_delta)}</td><td><strong>{r.effective_points}</strong></td></tr>)}</tbody></table></div>}
 <p style={{fontSize:13,color:"#677689",marginTop:24}}>Тестовый итог = исходные очки + разница пересчёта по исходным и тестовым данным. Новые матчи без результата очков пока не дают.</p>
 </main>;
}