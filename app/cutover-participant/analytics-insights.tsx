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
  kickoff_at?: string | null;
  home_team?: string | null;
  away_team?: string | null;
  points_outcome_bonus?: string | null;
  points_diff_bonus?: string | null;
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
    const points = predictions.reduce((sum,row) => sum + Number(row.points),0);
    let rareCorrect = 0;
    let rarePoints = 0;
    let againstFour = 0;
    for (const group of perMatch.values()) {
      const own = group.find(row => row.user_id === user.id);
      if (!own || group.length !== 5 || new Set(group.map(r=>r.user_id)).size!==5) continue;
      const opinions = group.map(row => outcome(row.home_pred,row.away_pred));
      const ownOutcome = outcome(own.home_pred,own.away_pred);
      const matching = opinions.filter(choice => choice === ownOutcome).length;
      // Exactly one dissenting outcome against four identical choices.
      if (matching === 1 && new Set(opinions.filter(choice=>choice!==ownOutcome)).size === 1) {
        againstFour++;
        if (ownOutcome === outcome(own.home_score,own.away_score)) {
          rareCorrect++;
          rarePoints += Number(own.points);
        }
      }
    }
    return {...user, predictions:predictions.length, exact, outcomes, goalDiff, points,
      avgPoints:predictions.length ? points/predictions.length : 0,
      error:predictions.length ? error/predictions.length : null,
      rareCorrect,rarePoints,againstFour};
  });

  const places = [...byUser].sort((x,y)=>y.points-x.points||x.username.localeCompare(y.username,"ru"));
  const placeFor=(id:string)=>places.findIndex(user=>user.id===id)+1;

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

  // Read the actual ledger bonus components, not a reconstructed approximation.
  // Outcome and goal-difference rarity are independent; a match can award both.
  const rarity=users.map(user=>{
    const scored=finished.filter(row=>row.user_id===user.id);
    const outcomeBonus=scored.reduce((n,r)=>n+Number(r.points_outcome_bonus??0),0);
    const diffBonus=scored.reduce((n,r)=>n+Number(r.points_diff_bonus??0),0);
    return {...user, outcomeBonus, diffBonus, total:outcomeBonus+diffBonus,
      outcomeMatches:scored.filter(r=>Number(r.points_outcome_bonus??0)>0).length,
      diffMatches:scored.filter(r=>Number(r.points_diff_bonus??0)>0).length};
  });
  const rareExamples=finished.filter(r=>
    Number(r.points_outcome_bonus??0)>0 || Number(r.points_diff_bonus??0)>0)
    .sort((x,y)=>(y.kickoff_at??"").localeCompare(x.kickoff_at??"")||Number(y.match_id)-Number(x.match_id))
    .slice(0,12);

  // Count consecutive scored matches in chronological order. Zero points break
  // the successful run; a positive score breaks the unsuccessful run.
  const streaks=users.map(user=>{
    const scored=finished.filter(r=>r.user_id===user.id)
      .sort((x,y)=>(x.kickoff_at??"").localeCompare(y.kickoff_at??"")||Number(x.match_id)-Number(y.match_id));
    let positive=0,zero=0,bestPositive=0,bestZero=0;
    for(const r of scored){
      if(Number(r.points)>0){positive++;zero=0;} else {zero++;positive=0;}
      bestPositive=Math.max(bestPositive,positive);
      bestZero=Math.max(bestZero,zero);
    }
    const tourScores=new Map<string,number>();
    for(const row of scored){
      // stage_match_no is not needed: the current-table API exposes tour_id.
      const tourId=(row as Row & {tour_id?:string|null}).tour_id;
      if(tourId) tourScores.set(tourId,(tourScores.get(tourId)??0)+Number(row.points));
    }
    const totals=[...tourScores.values()];
    return {...user,played:scored.length,bestPositive,bestZero,
      currentPositive:positive,currentZero:zero,
      bestTour:totals.length?Math.max(...totals):null,
      worstTour:totals.length?Math.min(...totals):null};
  });

  // Team accuracy: include both home and away fixtures, once per team/match.
  // At least three completed, scored predictions are needed to rank a team.
  const teams=users.map(user=>{
    const byTeam=new Map<string,{matches:number;points:number}>();
    for(const r of finished.filter(p=>p.user_id===user.id)){
      for(const name of new Set([r.home_team,r.away_team].filter((n):n is string=>!!n))){
        const prev=byTeam.get(name)??{matches:0,points:0};
        byTeam.set(name,{matches:prev.matches+1,points:prev.points+Number(r.points)});
      }
    }
    const eligible=[...byTeam].filter(([,v])=>v.matches>=3)
      .map(([name,v])=>({name,...v,average:v.points/v.matches}));
    const best=[...eligible].sort((x,y)=>y.average-x.average||y.matches-x.matches||x.name.localeCompare(y.name,"ru"))[0]??null;
    const worst=[...eligible].sort((x,y)=>x.average-y.average||y.matches-x.matches||x.name.localeCompare(y.name,"ru"))[0]??null;
    return {...user,best,worst};
  });

  return <div style={{display:"grid",gap:24,marginTop:28}}>
    <section>
      <h3>Результаты и точность прогнозов</h3>
      <p>Одна сводная таблица текущего этапа. «Очки» — сумма начислений, «за матч» — среднее число очков за оценённый прогноз. «Точный» — угаданы оба числа счёта; «исход» — победа хозяев, гостей или ничья; «разница» — угадана разница голов (например, 2:1 и 3:2). «Ошибка» — среднее суммарное отклонение по голам двух команд: чем меньше, тем точнее. Место определяется по очкам.</p>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Участник</th><th>Матчей</th><th>Очки</th><th>За матч</th><th>Точных</th><th>Исходов</th><th>Разница</th><th>Ошибка</th><th>Место</th></tr></thead>
        <tbody>{byUser.map(u=><tr key={u.id}>
          <td><strong>{u.username}{u.username===viewer?" · ты":""}</strong></td>
          <td>{u.predictions}</td><td>{number(u.points)}</td><td>{u.predictions?number(u.avgPoints):"—"}</td>
          <td>{u.exact}{u.predictions?" ("+Math.round(100*u.exact/u.predictions)+"%)":""}</td>
          <td>{u.outcomes}{u.predictions?" ("+Math.round(100*u.outcomes/u.predictions)+"%)":""}</td>
          <td>{u.goalDiff}</td><td>{u.error===null?"—":number(u.error)}</td><td>{placeFor(u.id)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section>
      <h3>Один против всех</h3>
      <p>«Против большинства» — ты поставил, например, на ничью, а все остальные четверо — на победу одной и той же команды. «Оказался прав» — твой единственный вариант совпал с реальным исходом. «Очки за удачные случаи» — сколько ты набрал в таких матчах по обычным правилам клуба. Считаем только сыгранные матчи, где есть результаты и очки всех пяти участников.</p>
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
      <p>Здесь мы сравниваем, кто из двух участников лучше предсказывал <strong>одни и те же футбольные матчи</strong>. Выбери двух участников. Мы берём каждый завершённый матч текущего этапа, за который <strong>обоим</strong> уже начислены очки, и сравниваем их результаты.</p>
      <p><strong>Пример:</strong> за матч «Спартак — Акрон» АМН получил 4 очка, а БАА — 2. В этой дуэли победил АМН, потому что его прогноз принёс больше очков. Если бы оба получили по 2 очка, это была бы ничья. Так сравниваются все общие сыгранные матчи.</p>
      <ul>
        <li><strong>Победы в матчевых дуэлях</strong> — количество матчей, в которых прогноз этого участника принёс больше очков, чем прогноз соперника. Это не победы футбольных команд.</li>
        <li><strong>Ничьи в дуэлях</strong> — количество матчей, в которых оба участника получили одинаковое число очков, даже если их прогнозы отличались.</li>
        <li><strong>Очки в общих матчах</strong> — сколько очков каждый набрал суммарно именно за матчи, по которым есть начисления у обоих.</li>
        <li><strong>Разница очков</strong> — на сколько очков один участник опередил другого в этих общих матчах.</li>
      </ul>
      <p>Например, результат «Победы: 12 и 9; ничьи: 3» означает, что в 12 матчах больше очков получил первый участник, в 9 — второй, а ещё в 3 они набрали поровну. <strong>Дуэль — только статистика для сравнения:</strong> дополнительные очки и награды за неё не начисляются.</p>
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
          <tr><td>Матчей с большим числом очков</td><td><strong>{winsA}</strong></td><td><strong>{winsB}</strong></td></tr>
          <tr><td>Матчей с одинаковыми очками</td><td colSpan={2}>{ties}</td></tr>
          <tr><td>Всего очков в общих матчах</td><td>{number(totalA)}</td><td>{number(totalB)}</td></tr>
          <tr><td>Разница очков</td><td colSpan={2}>{totalA===totalB ? "Равенство" : number(Math.abs(totalA-totalB))+" в пользу "+(totalA>totalB?leftName:rightName)}</td></tr>
        </tbody>
      </table></div>
    </section>
    <section>
      <h3>Редкие правильные прогнозы — дополнительные очки</h3>
      <p>Если исход или разницу голов правильно угадали немногие, клубные правила увеличивают очки за эту часть прогноза. При одном угадавшем коэффициент 1,75, при двух — 1,50, при трёх — 1,25, при четырёх или пяти — 1,00. Здесь показана <strong>только прибавка сверх обычных очков</strong>, а не все очки за такие матчи. Исход и разница учитываются отдельно; начисления уже входят в рейтинг.</p>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Участник</th><th>Бонус за исход</th><th>Бонус за разницу</th><th>Всего доп. очков</th><th>Матчей с бонусом за исход</th><th>За разницу</th></tr></thead>
        <tbody>{rarity.map(u=><tr key={u.id}><td><strong>{u.username}</strong></td>
          <td>{number(u.outcomeBonus)}</td><td>{number(u.diffBonus)}</td><td><strong>{number(u.total)}</strong></td>
          <td>{u.outcomeMatches}</td><td>{u.diffMatches}</td></tr>)}</tbody>
      </table></div>
      <details><summary>Показать последние начисления повышенных бонусов</summary>
        {rareExamples.length===0?<p>В текущем этапе пока нет начислений повышенных бонусов.</p>:
          <div className="tableWrap"><table className="table">
            <thead><tr><th>Матч</th><th>Участник</th><th>Прогноз</th><th>Результат</th><th>Бонус за исход</th><th>Бонус за разницу</th></tr></thead>
            <tbody>{rareExamples.map((r,i)=><tr key={r.match_id+"-"+r.user_id+"-"+i}>
              <td>{r.home_team} — {r.away_team}</td>
              <td>{users.find(u=>u.id===r.user_id)?.username??"—"}</td>
              <td>{r.home_pred}:{r.away_pred}</td><td>{r.home_score}:{r.away_score}</td>
              <td>{number(Number(r.points_outcome_bonus??0))}</td>
              <td>{number(Number(r.points_diff_bonus??0))}</td>
            </tr>)}</tbody>
          </table></div>}
      </details>
    </section>
    <section>
      <h3>Серии и стабильность</h3>
      <p>Успешная серия — подряд сыгранные матчи, за которые получено больше нуля очков. Серия без очков — подряд матчи с нулём. «Текущая серия» продолжается до последнего матча с начислением, даже если следующие игры ещё не закончились. Лучший и худший тур определяются по сумме очков в турах, где есть начисления; незавершённый тур может ещё изменить рекорд.</p>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Участник</th><th>Матчей</th><th>Лучшая серия с очками</th><th>Самая длинная без очков</th><th>Текущая серия</th><th>Лучший тур</th><th>Худший тур</th></tr></thead>
        <tbody>{streaks.map(u=><tr key={u.id}><td><strong>{u.username}</strong></td>
          <td>{u.played}</td><td>{u.bestPositive}</td><td>{u.bestZero}</td>
          <td>{u.played===0?"—":u.currentPositive>0?u.currentPositive+" с очками":u.currentZero+" без очков"}</td>
          <td>{u.bestTour===null?"—":number(u.bestTour)}</td><td>{u.worstTour===null?"—":number(u.worstTour)}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <section>
      <h3>Любимые и неудобные команды</h3>
      <p>Для каждой команды считаем среднее количество очков за прогнозы матчей с её участием — дома и в гостях. «Любимая» команда приносит участнику больше всего очков в среднем, «неудобная» — меньше всего. Для сравнения нужно минимум три сыгранных матча этой команды с начислениями. Это статистика прогнозов, а не симпатий к командам.</p>
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Участник</th><th>Лучше всего прогнозирует</th><th>Очков за матч</th><th>Сложнее всего прогнозирует</th><th>Очков за матч</th></tr></thead>
        <tbody>{teams.map(u=><tr key={u.id}><td><strong>{u.username}</strong></td>
          <td>{u.best?u.best.name+" ("+u.best.matches+" матч.)":"Пока мало матчей"}</td>
          <td>{u.best?number(u.best.average):"—"}</td>
          <td>{u.worst?u.worst.name+" ("+u.worst.matches+" матч.)":"Пока мало матчей"}</td>
          <td>{u.worst?number(u.worst.average):"—"}</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
