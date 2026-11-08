"use client";

import { useMemo, useState } from "react";

type User = { id: string; username: string };
type Row = { match_id: string; tour_id: string | null; user_id: string | null;
  home_pred: number | null; away_pred: number | null; points: string | null };
type Match = { id: string; tour_id: string | null; status: string; home_score: number | null;
  away_score: number | null; home_team: string; away_team: string };
type Tour = { id: string; name: string; stage_id: string };
type Table = { stage: { id: string; name: string } | null; users: User[]; rows: Row[] };
type Score = { h: number; a: number };
type Standing = { name: string; id: string; points: number; place: number };
type Breakdown = { id: string; name: string; prediction: string; points: number };

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const show = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sign = (v: number) => v > 0 ? 1 : v < 0 ? -1 : 0;
const multiplier = (count: number) => count === 1 ? 1.75 : count === 2 ? 1.5 : count === 3 ? 1.25 : 1;
const valid = (v: number) => Number.isInteger(v) && v >= 0 && v <= 30;

export function calculateIntriguePoints(predictions: { id: string; h: number; a: number }[], score: Score) {
  const outcome = sign(score.h - score.a), diff = score.h - score.a;
  const outcomes = predictions.filter(p => sign(p.h - p.a) === outcome).length;
  const differences = predictions.filter(p => p.h - p.a === diff).length;
  const om = multiplier(outcomes), dm = multiplier(differences);
  const points = new Map<string, number>();
  for (const p of predictions) {
    const total = (sign(p.h - p.a) === outcome ? 2 * om : 0)
      + (p.h - p.a === diff ? dm : 0)
      + (p.h === score.h ? .5 : 0) + (p.a === score.a ? .5 : 0)
      + (Math.abs(p.h - score.h) + Math.abs(p.a - score.a) === 1 ? .5 : 0);
    points.set(p.id, round(total));
  }
  return points;
}

function rank(users: User[], totals: Map<string, number>): Standing[] {
  const ordered = users.map(u => ({ name:u.username, id:u.id, points:round(totals.get(u.id) ?? 0), place:0 }))
    .sort((a,b) => b.points-a.points || a.name.localeCompare(b.name,"ru"));
  let place = 0;
  return ordered.map((u,i) => {
    if (i===0 || u.points!==ordered[i-1].points) place=i+1;
    return {...u,place};
  });
}

export default function AdminIntrigue({ table, matches, tours }: {table:Table|null; matches:Match[]; tours:Tour[]}) {
  const [selected, setSelected] = useState("");
  const [drafts, setDrafts] = useState<Record<string,Score>>({});
  const [maxGoals, setMaxGoals] = useState(5);
  const available = useMemo(() => matches.filter(m => m.status !== "finished" &&
    m.home_score === null && m.away_score === null), [matches]);
  const matchId = available.some(m => m.id === selected) ? selected : (available[0]?.id ?? "");
  const activeMatch = available.find(m => m.id === matchId);
  const selectedScore = drafts[matchId];
  const users = table?.users ?? [];
  const rows = table?.rows ?? [];

  const snapshot = useMemo(() => {
    // Admin calendar excludes isolated test matches; the table endpoint may not.
    // Keep the model confined to the matches visible in the real stage calendar.
    const allowedMatches = new Set(matches.map(m=>m.id));
    const base = new Map(users.map(u => [u.id,0]));
    const byTour = new Map<string,Map<string,number>>();
    const predictions = new Map<string,{id:string;h:number;a:number}[]>();
    for (const row of rows) {
      if (!allowedMatches.has(row.match_id) || !row.user_id || !base.has(row.user_id)) continue;
      if (row.home_pred !== null && row.away_pred !== null) {
        const values = predictions.get(row.match_id) ?? [];
        values.push({id:row.user_id,h:Number(row.home_pred),a:Number(row.away_pred)});
        predictions.set(row.match_id,values);
      }
      if (row.points === null) continue;
      const pts = Number(row.points);
      if (!Number.isFinite(pts)) continue;
      base.set(row.user_id,round((base.get(row.user_id)??0)+pts));
      if (row.tour_id) {
        const totals=byTour.get(row.tour_id)??new Map(users.map(u=>[u.id,0]));
        totals.set(row.user_id,round((totals.get(row.user_id)??0)+pts));
        byTour.set(row.tour_id,totals);
      }
    }
    return {base,byTour,predictions};
  },[users,rows,matches]);

  function project(scores: Record<string,Score>, tourId: string|null) {
    const stage=new Map(snapshot.base);
    const tour=new Map(snapshot.byTour.get(tourId??"") ?? users.map(u=>[u.id,0] as const));
    for (const match of available) {
      const score=scores[match.id];
      if (!score || !valid(score.h) || !valid(score.a)) continue;
      const pts=calculateIntriguePoints(snapshot.predictions.get(match.id)??[],score);
      for (const [id,value] of pts) {
        stage.set(id,round((stage.get(id)??0)+value));
        if (match.tour_id===tourId) tour.set(id,round((tour.get(id)??0)+value));
      }
    }
    return {stage:rank(users,stage),tour:rank(users,tour)};
  }

  const projected = project(drafts,activeMatch?.tour_id??null);
  const selectedPoints = selectedScore && activeMatch
    ? calculateIntriguePoints(snapshot.predictions.get(matchId)??[],selectedScore) : null;
  const breakdown: Breakdown[] = users.map(u=>{
    const p=(snapshot.predictions.get(matchId)??[]).find(pred=>pred.id===u.id);
    return {id:u.id,name:u.username,prediction:p?`${p.h}:${p.a}`:"—",points:selectedPoints?.get(u.id)??0};
  });

  const singleRemaining = available.length===1 && !!activeMatch && users.length>0 &&
    (snapshot.predictions.get(matchId)?.length ?? 0)===users.length;
  const scenarioSummary = useMemo(()=>{
    if (!singleRemaining || !activeMatch) return [] as {winners:string[]; count:number; examples:string[]}[];
    const groups=new Map<string,{winners:string[];count:number;examples:string[]}>();
    for(let h=0;h<=maxGoals;h++) for(let a=0;a<=maxGoals;a++){
      const standing=project({[activeMatch.id]:{h,a}},activeMatch.tour_id).stage;
      const winners=standing.filter(s=>s.place===1).map(s=>s.name);
      const key=winners.join("/");
      const old=groups.get(key)??{winners,count:0,examples:[]};
      old.count++;
      if(old.examples.length<6) old.examples.push(`${h}:${a}`);
      groups.set(key,old);
    }
    return [...groups.values()].sort((x,y)=>y.count-x.count);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[singleRemaining,activeMatch,maxGoals,snapshot,users,available]);

  if (!table?.stage || !users.length) return <section className="cutover-intrigue">
    <h3>Интрига тура</h3><p>Ожидаем данные текущего этапа и прогнозов участников.</p>
  </section>;

  const selectedTour=tours.find(t=>t.id===activeMatch?.tour_id);
  const totalScenarios=(maxGoals+1)**2;
  const setScore=(score:Score)=>setDrafts(prev=>({...prev,[matchId]:score}));

  return <section className="cutover-intrigue" aria-label="Интрига тура — симулятор">
    <div className="cutover-section-heading"><div><span>РАСЧЁТ БЕЗ СОХРАНЕНИЯ</span><h2>Интрига тура</h2></div>
      <p>Как счёт оставшихся матчей изменит места участников</p></div>
    <p>Этап: <b>{table.stage.name}</b>. Незавершённых матчей: <b>{available.length}</b>.
      Используются сохранённые начисления и действующие правила редких прогнозов.</p>
    {!available.length ? <p>Все матчи текущего этапа завершены. Результаты симуляции не требуются.</p> : <>
      <div className="cutover-intrigue-controls">
        <label>Матч
          <select value={matchId} onChange={e=>setSelected(e.target.value)}>
            {available.map(m=><option key={m.id} value={m.id}>{m.home_team} — {m.away_team} · {tours.find(t=>t.id===m.tour_id)?.name??"Тур"}</option>)}
          </select>
        </label>
        <div className="cutover-intrigue-inputs">
          <label>Хозяева <input type="number" min={0} max={30} value={selectedScore?.h??""}
            placeholder="—" onChange={e=>{const n=Number(e.target.value);if(e.target.value!==""&&valid(n))setScore({h:n,a:selectedScore?.a??0});}}/></label>
          <span>:</span>
          <label>Гости <input type="number" min={0} max={30} value={selectedScore?.a??""}
            placeholder="—" onChange={e=>{const n=Number(e.target.value);if(e.target.value!==""&&valid(n))setScore({h:selectedScore?.h??0,a:n});}}/></label>
        </div>
        <div className="cutover-intrigue-presets">
          {(["0:1","1:1","2:1","1:0","0:0"] as const).map(value=><button key={value} type="button"
            className={selectedScore&&`${selectedScore.h}:${selectedScore.a}`===value?"is-active":""}
            onClick={()=>{const [h,a]=value.split(":").map(Number);setScore({h,a});}}>{value}</button>)}
          <button type="button" onClick={()=>setDrafts(prev=>{const next={...prev};delete next[matchId];return next;})}
            disabled={!selectedScore}>Сбросить матч</button>
          <button type="button" onClick={()=>setDrafts({})} disabled={!Object.keys(drafts).length}>Сбросить всё</button>
        </div>
      </div>
      {Object.keys(drafts).length>0 && <p className="cutover-intrigue-note">
        В симуляции: {available.filter(m=>drafts[m.id]).map(m=>`${m.home_team} — ${m.away_team} ${drafts[m.id].h}:${drafts[m.id].a}`).join("; ")}.
      </p>}
      {selectedScore && <div className="cutover-intrigue-breakdown">
        <h3>Начисления за {activeMatch?.home_team} — {activeMatch?.away_team} при {selectedScore.h}:{selectedScore.a}</h3>
        <div className="cutover-intrigue-responsive"><table><thead><tr><th>Участник</th><th>Прогноз</th><th>Баллы</th></tr></thead>
          <tbody>{breakdown.map(r=><tr key={r.id}><td>{r.name}</td><td>{r.prediction}</td><td>{r.prediction==="—"?"—":"+"+show(r.points)}</td></tr>)}</tbody></table></div>
      </div>}
      <div className="cutover-intrigue-tables">
        {([{title:"Места в туре"+(selectedTour?" · "+selectedTour.name:""),rows:projected.tour},
           {title:"Места в этапе",rows:projected.stage}] as const).map(group=><div key={group.title}>
          <h3>{group.title}</h3>
          <table><thead><tr><th>Место</th><th>Участник</th><th>Очки</th></tr></thead>
            <tbody>{group.rows.map(u=><tr key={u.id}><td>{u.place}</td><td>{u.name}</td><td>{show(u.points)}</td></tr>)}</tbody></table>
        </div>)}
      </div>
      {singleRemaining ? <div className="cutover-intrigue-chances">
        <h3>Кому какие счета выгодны</h3>
        <p>Перебор всех {totalScenarios} счетов от 0:0 до {maxGoals}:{maxGoals}. Доля сценариев — <b>не вероятность футбольного результата</b>.
          При равных очках участники показаны как совместные лидеры; дополнительные критерии не моделируются.</p>
        <label>Диапазон голов каждой команды
          <select value={maxGoals} onChange={e=>setMaxGoals(Number(e.target.value))}>
            <option value={3}>0–3</option><option value={5}>0–5</option><option value={7}>0–7</option>
          </select>
        </label>
        <div className="cutover-intrigue-responsive"><table>
          <thead><tr><th>Лидер этапа</th><th>Сценариев</th><th>Доля</th><th>Примеры счетов</th></tr></thead>
          <tbody>{scenarioSummary.map(s=><tr key={s.winners.join("/")}>
            <td>{s.winners.join(", ")}</td><td>{s.count} из {totalScenarios}</td>
            <td>{show(s.count/totalScenarios*100)}%</td><td>{s.examples.join(", ")}</td>
          </tr>)}</tbody>
        </table></div>
      </div> : <p className="cutover-intrigue-note">
        {available.length>1?"Когда останется один матч, появится полный перебор возможных исходов. Сейчас можно задать несколько счетов вручную.":
          "Для перебора всех сценариев нужны прогнозы каждого участника на оставшийся матч."}
      </p>}
    </>}
    <p className="cutover-intrigue-footnote">Это только предварительный расчёт в браузере. Реальные результаты, прогнозы и очки не изменяются.
      При равенстве баллов окончательное место определяется действующим регламентом клуба.</p>
  </section>;
}
