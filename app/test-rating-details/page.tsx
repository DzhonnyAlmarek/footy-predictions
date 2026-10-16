"use client";
import {useEffect,useMemo,useState} from "react";
type Item={match_id:string;kickoff_at:string;home_team:string;away_team:string;original_home_score:number|null;original_away_score:number|null;test_home_score:number|null;test_away_score:number|null;home_pred:number|null;away_pred:number|null;prediction_overridden:boolean;result_overridden:boolean;original_points:string;test_points:string;delta:string;outcome:string;diff:string;home:string;away:string;near_bonus:string;original_outcome:string;original_diff:string;original_home:string;original_away:string;original_near_bonus:string};
export default function RatingDetails(){
 const [rows,setRows]=useState<Item[]>([]),[username,setUsername]=useState(""),[error,setError]=useState(""),[loading,setLoading]=useState(true),[onlyChanged,setOnlyChanged]=useState(false),[user,setUser]=useState("");
 useEffect(()=>{const q=new URLSearchParams(window.location.search).get("user")||"";setUser(q);
 fetch("/api/test/rating-details"+(q?"?user="+encodeURIComponent(q):""),{credentials:"same-origin",cache:"no-store"}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error==="unauthorized"?"Сессия истекла":d.error||"Ошибка");setRows(d.rows||[]);setUsername(d.username);}).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
 const visible=useMemo(()=>rows.filter(r=>!onlyChanged||Number(r.delta)!==0),[rows,onlyChanged]);
 const num=(v:string)=>Number(v).toFixed(2);
 const score=(a:number|null,b:number|null)=>a==null||b==null?"—":a+":"+b;
 return <main style={{maxWidth:950,margin:"30px auto",padding:"0 16px 36px"}}>
 <h1>Детализация тестовых очков</h1><p>Участник: <strong>{username||"…"}</strong>. Все данные только для сравнения, рабочие начисления не изменяются.</p>
 <p><a href="/test-rating-effective">← Сравнение рейтингов</a></p>
 <label style={{display:"flex",gap:8,alignItems:"center",margin:"20px 0"}}><input type="checkbox" checked={onlyChanged} onChange={e=>setOnlyChanged(e.target.checked)}/>Только матчи с изменением очков</label>
 {loading&&<p>Загрузка…</p>}{error&&<p role="alert">{error}</p>}
 {!loading&&!error&&<p>Матчей с расчётом: {rows.length}. Показано: {visible.length}.</p>}
 {visible.map(r=><article key={r.match_id} style={{border:"1px solid #d7e1ee",borderRadius:12,padding:15,margin:"10px 0"}}>
 <div style={{display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
 <div><strong>№{r.match_id} · {r.home_team} — {r.away_team}</strong>
 <div style={{fontSize:13,color:"#64748b",marginTop:5}}>Прогноз: {score(r.home_pred,r.away_pred)} {r.prediction_overridden?"(тестовый)":""} · Результат: {score(r.test_home_score,r.test_away_score)} {r.result_overridden?"(тестовый, исходный "+score(r.original_home_score,r.original_away_score)+")":""}</div></div>
 <div style={{textAlign:"right"}}><strong>{num(r.original_points)} → {num(r.test_points)}</strong><div style={{fontSize:13,color:Number(r.delta)!==0?"#ad4c1a":"#64748b"}}>Разница: {Number(r.delta)>0?"+":""}{num(r.delta)}</div></div></div>
 <details style={{marginTop:10}}><summary style={{cursor:"pointer"}}>Состав очков: было → стало</summary><div style={{overflowX:"auto",marginTop:10}}><table style={{width:"100%",maxWidth:520,borderCollapse:"collapse",fontSize:14}}><thead><tr><th style={{textAlign:"left"}}>Компонент</th><th>Было</th><th>Стало</th><th>Изменение</th></tr></thead><tbody>{([{name:"Исход",old:r.original_outcome,now:r.outcome},{name:"Разница голов",old:r.original_diff,now:r.diff},{name:"Голы хозяев",old:r.original_home,now:r.home},{name:"Голы гостей",old:r.original_away,now:r.away},{name:"Близкий счёт",old:r.original_near_bonus,now:r.near_bonus}]).map(c=><tr key={c.name} style={{borderTop:"1px solid #e2e8f0"}}><td style={{padding:"7px 0"}}>{c.name}</td><td style={{textAlign:"center"}}>{num(c.old)}</td><td style={{textAlign:"center"}}>{num(c.now)}</td><td style={{textAlign:"center"}}>{Number(c.now)-Number(c.old)>0?"+":""}{(Number(c.now)-Number(c.old)).toFixed(2)}</td></tr>)}</tbody></table></div></details>
 </article>)}
 {!loading&&!error&&visible.length===0&&<p>Нет матчей для выбранного фильтра.</p>}
 </main>;
}