"use client";
import { useEffect, useState } from "react";

type Stage = { id: number; name: string; is_current: boolean };
type Standing = { username: string; predictions_scored: number; points: string;
  points_outcome: string; points_diff: string; points_other: string };
type Result = { ok:boolean; stages:Stage[];selected_stage:Stage;rows:Standing[] };

export default function MigrationStandings() {
  const [selected,setSelected] = useState<string>("");
  const [data,setData] = useState<Result|null>(null);
  const [error,setError] = useState("");
  useEffect(() => {
    const controller=new AbortController();
    fetch("/api/test/migration-standings"+(selected?"?stage="+encodeURIComponent(selected):""),{
      cache:"no-store",signal:controller.signal
    }).then(async r => {
      if(!r.ok)throw Error("HTTP "+r.status);
      return r.json();
    }).then((v:Result)=>{
      if(!v.ok||!Array.isArray(v.rows)||!Array.isArray(v.stages))throw Error("bad response");
      setData(v);
      setError("");
    }).catch(()=>{
      if(!controller.signal.aborted)setError("Не удалось загрузить таблицу из Neon");
    });
    return ()=>controller.abort();
  },[selected]);
  const fmt=(v:string)=>Number(v).toLocaleString("ru-RU",{minimumFractionDigits:2,maximumFractionDigits:2});
  return <main style={{maxWidth:850,margin:"32px auto",padding:20,fontFamily:"sans-serif"}}>
    <h1>Турнирная таблица Footy — Neon</h1>
    <p>Локальная проверка сохранённых начислений. Только чтение. Равенство очков пока не учитывает специальные правила конкурса.</p>
    <label>Этап: <select value={selected||String(data?.selected_stage.id||"")} onChange={e=>setSelected(e.target.value)}>
      {data?.stages.map(s=><option value={s.id} key={s.id}>{s.name}{s.is_current?" (текущий)":""}</option>)}
    </select></label>
    {error&&<p role="alert">{error}</p>}
    {!data&&!error&&<p>Загрузка…</p>}
    {data&&<table style={{width:"100%",borderCollapse:"collapse",marginTop:20}}>
      <thead><tr><th align="left">№*</th><th align="left">Участник</th><th align="right">Начислений</th><th align="right">Очки</th><th align="right">Исход</th><th align="right">Разница</th><th align="right">Прочее</th></tr></thead>
      <tbody>{data.rows.map((r,i)=><tr key={r.username} style={{borderTop:"1px solid #ccc"}}>
        <td>{i+1}</td><td>{r.username}</td><td align="right">{r.predictions_scored}</td>
        <td align="right"><strong>{fmt(r.points)}</strong></td>
        <td align="right">{fmt(r.points_outcome)}</td>
        <td align="right">{fmt(r.points_diff)}</td>
        <td align="right">{fmt(r.points_other)}</td>
      </tr>)}</tbody>
    </table>}
    <p><small>* Предварительный порядок по сумме баллов. Сверка с действующим конкурсом ещё впереди.</small></p>
    <p><a href="/migration-schedule">Перейти к расписанию</a></p>
  </main>;
}
