"use client";

import { useState } from "react";

type Row = {
  match_id: string;
  user_id: string | null;
  home_pred: number | null;
  away_pred: number | null;
  home_score: number | null;
  away_score: number | null;
  points: string | null;
};
type User = { id: string; username: string };
type Props = { users: User[]; rows: Row[]; viewer: string };

function outcome(home: number, away: number) {
  return Math.sign(home - away);
}
function number(value: number) {
  return Number(value.toFixed(2)).toLocaleString("ru-RU");
}

export default function AnalyticsInsights({ users, rows, viewer }: Props) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");

  // Only scored predictions on matches with a published final result are
  // eligible for analytics. Never inspect or aggregate upcoming predictions.
  const finished = rows.filter((r): r is Row & {
    user_id: string; home_pred: number; away_pred: number;
    home_score: number; away_score: number; points: string;
  } => r.user_id !== null && r.home_pred !== null && r.away_pred !== null &&
      r.home_score !== null && r.away_score !== null && r.points !== null);

  const perMatch = new Map<string, typeof finished>();
  for (const row of finished) {
    perMatch.set(row.match_id, [...(perMatch.get(row.match_id) ?? []), row]);
  }
  const byUser = users.map(user => {
    const predictions = finished.filter(row => row.user_id === user.id);
    const exact = predictions.filter(row => row.home_pred === row.home_score && row.away_pred === row.away_score).length;
    const outcomes = predictions.filter(row => outcome(row.home_pred, row.away_pred) === outcome(row.home_score, row.away_score)).length;
    const goalDiff = predictions.filter(row => row.home_pred - row.away_pred === row.home_score - row.away_score).length;
    const error = predictions.reduce((sum,row) => sum + Math.abs(row.home_pred-row.home_score) + Math.abs(row.away_pred-row.away_score),0);
    let rareCorrect = 0;
    let rarePoints = 0;
    let againstFour = 0;
    for (const group of perMatch.values()) {
      const own = group.find(row => row.user_id === user.id);
      if (!own || group.length < 5) continue;
      const opinions = group.map(row => outcome(row.home_pred,row.away_pred));
      const ownOutcome = outcome(own.home_pred,own.away_pred);
      const matching = opinions.filter(choice => choice === ownOutcome).length;
      if (matching === 1) {
        againstFour++;
        if (ownOutcome === outcome(own.home_score,own.away_score)) {
          rareCorrect++;
          rarePoints += Number(own.points);
        }
      }
    }
    return {...user, predictions:predictions.length, exact, outcomes, goalDiff,
      error:predictions.length ? error/predictions.length : null,
      rareCorrect,rarePoints,againstFour};
  });

  const a = users.some(u=>u.id===first) ? first : users[0]?.id ?? "";
  const b = users.some(u=>u.id===second && u.id!==a) ? second :
    users.find(u=>u.id!==a)?.id ?? "";
  let winsA=0,winsB=0,ties=0,totalA=0,totalB=0;
  for (const group of perMatch.values()) {
    const left=group.find(row=>row.user_id===a);
    const right=group.find(row=>row.user_id===b);
    if (!left || !right) continue;
    const x=Number(left.points),y=Number(right.points);
    totalA+=x;totalB+=y;
    if (x>y) winsA++; else if(y>x) winsB++; else ties++;
  }
  const leftName=users.find(u=>u.id===a)?.username ?? "—";
  const rightName=users.find(u=>u.id===b)?.username ?? "—";

  return <div style={{display:"grid",gap:24,marginTop:28}}>
    <section>
      <h3>Точность прогнозирования</h3>
      <p>Точные счета, исходы, разница мячей и средняя ошибка по завершённым матчам. Чем меньше ошибка, тем лучше.</p>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Участник</th><th>Матчей</th><th>Точных</th><th>Исходов</th><th>Разница мячей</th><th>Средняя ошибка</th></tr></thead>
        <tbody>{byUser.map(u=><tr key={u.id}>
          <td><strong>{u.username}{u.username===viewer?" · ты":""}</strong></td>
          <td>{u.predictions}</td>
          <td>{u.exact}{u.predictions?" ("+Math.round(100*u.exact/u.predictions)+"%)":""}</td>
          <td>{u.outcomes}{u.predictions?" ("+Math.round(100*u.outcomes/u.predictions)+"%)":""}</td>
          <td>{u.goalDiff}</td><td>{u.error===null?"—":number(u.error)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section>
      <h3>Один против всех</h3>
      <p>Случаи, когда один участник выбрал иной исход, чем остальные четверо. Учитываются только матчи со всеми пятью начисленными прогнозами. Это статистика рискованных решений, а не отдельная клубная номинация.</p>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Участник</th><th>Против большинства</th><th>Оказался прав</th><th>Очки за удачные случаи</th></tr></thead>
        <tbody>{byUser.map(u=><tr key={u.id}>
          <td><strong>{u.username}</strong></td><td>{u.againstFour}</td>
          <td>{u.rareCorrect}</td><td>{number(u.rarePoints)}</td>
        </tr>)}</tbody>
      </table></div>
      <small>Очки здесь приведены справочно и уже входят в общий рейтинг. Дополнительно не начисляются.</small>
    </section>
    <section>
      <h3>Дуэль участников</h3>
      <p>Сравнение очков, набранных на одних и тех же завершённых матчах текущего этапа.</p>
      <div style={{display:"flex",gap:12,flexWrap:"wrap",marginBottom:12}}>
        <label>Первый участник <select value={a} onChange={event=>setFirst(event.target.value)}>
          {users.filter(u=>u.id!==b).map(u=><option key={u.id} value={u.id}>{u.username}</option>)}
        </select></label>
        <label>Второй участник <select value={b} onChange={event=>setSecond(event.target.value)}>
          {users.filter(u=>u.id!==a).map(u=><option key={u.id} value={u.id}>{u.username}</option>)}
        </select></label>
      </div>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Показатель</th><th>{leftName}</th><th>{rightName}</th></tr></thead>
        <tbody>
          <tr><td>Победы в матчевых дуэлях</td><td><strong>{winsA}</strong></td><td><strong>{winsB}</strong></td></tr>
          <tr><td>Ничьи в дуэлях</td><td colSpan={2}>{ties}</td></tr>
          <tr><td>Очки в общих матчах</td><td>{number(totalA)}</td><td>{number(totalB)}</td></tr>
          <tr><td>Разница очков</td><td colSpan={2}>{number(Math.abs(totalA-totalB))} в пользу {totalA===totalB?"ни одного — равенство":totalA>totalB?leftName:rightName}</td></tr>
        </tbody>
      </table></div>
    </section>
  </div>;
}
