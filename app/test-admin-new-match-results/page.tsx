"use client";
import {useEffect,useState} from "react";
type Match={id:string;home_team:string;away_team:string;stage_name:string|null;tour_name:string|null;kickoff_at:string;is_deleted:boolean;home_score:number|null;away_score:number|null};
type Rating={username:string;original_points:string;imported_test_points:string;new_match_points:string;total_test_points:string;delta:string};
type Score={match_id:string;username:string;home_pred:number;away_pred:number;points_outcome:string;points_diff:string;points_h1:string;points_h2:string;points_bonus:string;total:string};
export default function SimulatedResults(){
 const [matches,setMatches]=useState<Match[]>([]),[scores,setScores]=useState<Score[]>([]),[ratings,setRatings]=useState<Rating[]>([]),[selected,setSelected]=useState(""),[home,setHome]=useState("0"),[away,setAway]=useState("0"),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 async function load(){const r=await fetch("/api/test/admin/new-match-simulations",{credentials:"same-origin",cache:"no-store"});const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка загрузки");setMatches(d.matches);setScores(d.scores);setRatings(d.ratings||[]);}
 useEffect(()=>{void load().catch(e=>setMessage(String(e)));},[]);
 const m=matches.find(x=>x.id===selected);
 async function save(remove:boolean){if(!m||busy)return;setBusy(true);setMessage("");try{
  const r=await fetch("/api/test/admin/new-match-simulations"+(remove?"?matchId="+encodeURIComponent(selected):""),{method:remove?"DELETE":"POST",credentials:"same-origin",headers:{"Content-Type":"application/json"},body:remove?undefined:JSON.stringify({matchId:Number(selected),homeScore:Number(home),awayScore:Number(away)})});
  const d=await r.json();if(!r.ok)throw Error(d.error||"Ошибка");await load();setMessage(remove?"Тестовая симуляция отменена.":"Тестовая симуляция сохранена.");
 }catch(e){setMessage(e instanceof Error?e.message:"Ошибка");}finally{setBusy(false);}}
 const relevant=scores.filter(x=>x.match_id===selected);
 return <main style={{maxWidth:940,margin:"36px auto",padding:20}}>
 <h1>Симуляция результатов новых матчей</h1><p>Только тестовая Neon. Это не официальный результат матча и не изменение рабочих очков.</p>
 <p><a href="/test-admin-results">← Тестовые результаты</a></p>
 <label>Тестовый матч <select value={selected} onChange={e=>{const id=e.target.value;setSelected(id);const x=matches.find(m=>m.id===id);setHome(String(x?.home_score??0));setAway(String(x?.away_score??0));setMessage("");}}><option value="">Выбери матч</option>{matches.map(x=><option key={x.id} value={x.id}>T-{x.id} · {x.home_team} — {x.away_team} · {x.stage_name||"—"} / {x.tour_name||"—"}</option>)}</select></label>
 {m&&<section style={{marginTop:20}}><h2>{m.home_team} — {m.away_team}</h2><p>Начало: {new Date(m.kickoff_at).toLocaleString("ru-RU",{timeZone:"Europe/Moscow"})} МСК</p>
 <p>Тестовый результат: {m.home_score==null?"не задан":m.home_score+" : "+m.away_score}</p>
 <label>Хозяева <input type="number" min="0" max="30" value={home} onChange={e=>setHome(e.target.value)}/></label>{" : "}
 <label>Гости <input type="number" min="0" max="30" value={away} onChange={e=>setAway(e.target.value)}/></label>
 <div style={{display:"flex",gap:10,marginTop:15}}><button disabled={busy||m.is_deleted||!/^(?:[0-9]|[12][0-9]|30)$/.test(home)||!/^(?:[0-9]|[12][0-9]|30)$/.test(away)} onClick={()=>void save(false)}>Сохранить симуляцию</button><button disabled={busy||m.home_score==null} onClick={()=>void save(true)}>Отменить симуляцию</button></div>
 <h3>Очки участников по этому матчу</h3>{relevant.length===0?<p>Нет расчёта: отсутствует результат или прогноз.</p>:<table><thead><tr><th>Участник</th><th>Прогноз</th><th>Исход</th><th>Разница</th><th>Точные голы</th><th>Бонус</th><th>Итого</th></tr></thead><tbody>{relevant.map(x=><tr key={x.username}><td>{x.username}</td><td>{x.home_pred}:{x.away_pred}</td><td>{x.points_outcome}</td><td>{x.points_diff}</td><td>{Number(x.points_h1)+Number(x.points_h2)}</td><td>{x.points_bonus}</td><td><strong>{x.total}</strong></td></tr>)}</tbody></table>}</section>}
 <section style={{marginTop:28}}><h2>Общий тестовый рейтинг</h2><p>Импортированные матчи с тестовыми изменениями + симуляции новых матчей. Рабочие очки не изменяются.</p><table><thead><tr><th>Участник</th><th>Рабочие очки</th><th>Тестовые по импортированным</th><th>Новые матчи</th><th>Всего тестовых</th><th>Разница</th></tr></thead><tbody>{ratings.map(x=><tr key={x.username}><td>{x.username}</td><td>{x.original_points}</td><td>{x.imported_test_points}</td><td>{x.new_match_points}</td><td><strong>{x.total_test_points}</strong></td><td>{x.delta}</td></tr>)}</tbody></table></section><p role="status">{message}</p><style jsx>{`input,select{margin:8px;padding:8px;border:1px solid #aebbd0;border-radius:6px}button{padding:10px;border:1px solid #aebbd0;border-radius:7px;cursor:pointer}button:disabled{opacity:.5}td,th{padding:9px;border-bottom:1px solid #ddd;text-align:left}`}</style></main>;
}