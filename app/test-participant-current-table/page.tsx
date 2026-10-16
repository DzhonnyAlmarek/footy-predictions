"use client";
import {useEffect,useMemo,useState} from "react";
type User={id:string;username:string};
type Match={source:string;match_id:string;display_id:string;kickoff_at:string;status:string;home_team:string;away_team:string;tour_name:string|null;home_score:number|null;away_score:number|null};
type Entry={source:string;match_id:string;user_id:string;home_pred:number;away_pred:number;points:string|null;points_outcome:string|null;points_diff:string|null;points_h1:string|null;points_h2:string|null;points_bonus:string|null};
export default function CurrentTable(){
 const [stage,setStage]=useState<{id:string;name:string}|null>(null),[users,setUsers]=useState<User[]>([]),[matches,setMatches]=useState<Match[]>([]),[entries,setEntries]=useState<Entry[]>([]),[error,setError]=useState(""),[loading,setLoading]=useState(true);
 useEffect(()=>{fetch("/api/test/participant-current-table",{credentials:"same-origin",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла — войди снова":d.error||"Ошибка");setStage(d.stage);setUsers(d.users||[]);setMatches(d.matches||[]);setEntries(d.entries||[]);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const byKey=useMemo(()=>new Map(entries.map(e=>[e.source+":"+e.match_id+":"+e.user_id,e])),[entries]);
 const totals=useMemo(()=>users.map(u=>({id:u.id,username:u.username,points:entries.filter(e=>e.user_id===u.id).reduce((s,e)=>s+Number(e.points||0),0)})),[users,entries]);
 const date=(v:string)=>new Date(v).toLocaleString("ru-RU",{timeZone:"Europe/Moscow",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
 return <main style={{maxWidth:1200,margin:"26px auto",padding:"0 16px 40px"}}>
 <h1>Текущая таблица</h1><p>{stage?.name||"Текущий этап не выбран"} · тестовая версия Neon, только просмотр</p>
 <p><a href="/test-participant-competitions">← Этапы и туры</a> · <a href="/test-rating-effective">Рейтинг</a></p>
 {loading&&<p>Загрузка…</p>}{error&&<p role="alert">{error}</p>}
 {!loading&&!error&&stage&&<div style={{overflowX:"auto",border:"1px solid #d8e1ed",borderRadius:10}}>
 <table style={{borderCollapse:"collapse",width:"100%",minWidth:840,fontSize:13,textAlign:"center"}}>
 <thead><tr style={{background:"#edf3fb"}}><th style={{position:"sticky",left:0,background:"#edf3fb",minWidth:230,padding:10,textAlign:"left"}}>Матч / результат</th>{users.map(u=><th key={u.id} style={{minWidth:90,padding:10}}>{u.username}</th>)}</tr></thead>
 <tbody>{matches.map(m=><tr key={m.source+":"+m.match_id} style={{borderTop:"1px solid #e1e7ef"}}><td style={{position:"sticky",left:0,background:"white",textAlign:"left",padding:10}}><strong>{m.display_id} · {m.home_team} — {m.away_team}</strong><div style={{fontSize:11,color:"#66758a",marginTop:4}}>{m.tour_name||""} · {date(m.kickoff_at)} МСК</div><div style={{marginTop:4}}>Результат: {m.home_score==null||m.away_score==null?"—":m.home_score+":"+m.away_score}</div></td>{users.map(u=>{const e=byKey.get(m.source+":"+m.match_id+":"+u.id);return <td key={u.id} style={{padding:"8px 6px"}}>{e?<><strong>{e.home_pred}:{e.away_pred}</strong><div style={{marginTop:4,color:"#28558e"}}>{e.points==null?"—":Number(e.points).toFixed(2)}</div>{e.points!=null&&<details style={{marginTop:3,fontSize:11}}><summary style={{cursor:"pointer"}}>Очки</summary><div>Исход {e.points_outcome}<br/>Разница {e.points_diff}<br/>Голы {Number(e.points_h1||0)+Number(e.points_h2||0)}<br/>Бонус {e.points_bonus}</div></details>}</>:<span style={{color:"#94a3b8"}}>—</span>}</td>})}</tr>)}
 <tr style={{background:"#eef5ff",borderTop:"2px solid #9ab1cf",fontWeight:700}}><td style={{position:"sticky",left:0,background:"#eef5ff",padding:12,textAlign:"left"}}>Итого по этапу</td>{totals.map(t=><td key={t.id}>{t.points.toFixed(2)}</td>)}</tr></tbody></table></div>}
 {!loading&&!error&&!stage&&<p>Текущий опубликованный этап не выбран.</p>}
 <p style={{fontSize:12,color:"#697a90"}}>Очки рассчитаны по эффективным тестовым прогнозам и результатам. Исходные данные и рабочие начисления не изменяются.</p>
 </main>;
}