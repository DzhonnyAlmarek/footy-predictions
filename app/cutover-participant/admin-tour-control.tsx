"use client";

import { useEffect } from "react";

type Match = {
  id: string; tour_id: string | null; status: string; home_score: number | null;
  away_score: number | null; home_team: string; away_team: string;
  kickoff_at: string; deadline_at: string;
};
type Tour = { id: string; name: string; stage_id: string };
type Row = { match_id: string; user_id: string | null; points: string | null };
type Participant = { id: string; username: string };
type Props = {
  currentStageId: string;
  currentStageName: string;
  selectedTourId: string;
  onSelectTour: (tourId: string) => void;
  selectedStageId: string;
  matches: Match[];
  tours: Tour[];
  table: { stage:{id:string;name:string}|null; users:Participant[]; rows:Row[] } | null;
};

export default function AdminTourControl({ currentStageId, currentStageName, selectedStageId, selectedTourId, onSelectTour, matches, tours, table }: Props) {
  if (selectedStageId !== currentStageId) {
    return <section className="cutover-tour-control">
      <h3>Контроль тура</h3>
      <p>Контроль результатов и начислений доступен для текущего этапа. Выбери текущий этап в календаре.</p>
    </section>;
  }
  const stageTours=tours.filter(t=>t.stage_id===currentStageId && matches.some(m=>m.tour_id===t.id));
  const pendingTours=[...stageTours].filter(t=>matches.some(m=>m.tour_id===t.id && m.status!=="finished"))
    .sort((a,b)=>{
      const next=(t:Tour)=>Math.min(...matches.filter(m=>m.tour_id===t.id && m.status!=="finished").map(m=>new Date(m.kickoff_at).getTime()));
      return next(a)-next(b);
    });
  const fallbackTour=pendingTours[0]?.id ?? [...stageTours].sort((a,b)=>{
    const latest=(t:Tour)=>Math.max(...matches.filter(m=>m.tour_id===t.id).map(m=>new Date(m.kickoff_at).getTime()));
    return latest(b)-latest(a);
  })[0]?.id ?? "";
  const actualTour=stageTours.some(t=>t.id===selectedTourId)?selectedTourId:fallbackTour;
  useEffect(() => {
    if (selectedStageId===currentStageId && selectedTourId==="current" && fallbackTour) onSelectTour(fallbackTour);
  }, [selectedStageId,currentStageId,selectedTourId,fallbackTour,onSelectTour]);
  const tour=stageTours.find(t=>t.id===actualTour);
  const selected=matches.filter(m=>m.tour_id===actualTour)
    .sort((a,b)=>new Date(a.kickoff_at).getTime()-new Date(b.kickoff_at).getTime()||Number(a.id)-Number(b.id));
  const finished=selected.filter(m=>m.status==="finished");
  const tableReady=table?.stage?.id===currentStageId && Array.isArray(table.users) && Array.isArray(table.rows);
  const users=tableReady?table.users:[];
  const rows=tableReady?table.rows:[];
  const participants=users.length;
  const diagnostics=selected.map(match=>{
    const predictions=rows.filter(r=>r.match_id===match.id && r.user_id!==null);
    const predictionUsers=new Set(predictions.map(r=>r.user_id));
    const scoredUsers=new Set(predictions.filter(r=>r.points!==null).map(r=>r.user_id));
    const missing=users.filter(u=>!predictionUsers.has(u.id)).map(u=>u.username);
    const complete=match.status==="finished" && participants>0 && scoredUsers.size===participants;
    const incomplete=match.status==="finished" && !complete;
    const due=match.status!=="finished" && new Date(match.deadline_at).getTime()<=Date.now();
    return {match,predictionCount:predictionUsers.size,scoredCount:scoredUsers.size,missing,complete,incomplete,due};
  });
  const totalPredictions=diagnostics.reduce((sum,item)=>sum+item.predictionCount,0);
  const totalScored=diagnostics.filter(item=>item.match.status==="finished").reduce((sum,item)=>sum+item.scoredCount,0);
  const expected=selected.length*participants;
  const scoredExpected=finished.length*participants;
  const incomplete=diagnostics.filter(x=>x.incomplete);
  const due=diagnostics.filter(x=>x.due);
  const missingPredictions=diagnostics.filter(x=>x.missing.length>0);
  return <section className="cutover-tour-control" aria-label="Контроль текущего тура">
    <div className="cutover-tour-control-head">
      <div><span className="cutover-tour-eyebrow">ОПЕРАТИВНЫЙ КОНТРОЛЬ</span><h3>Контроль тура</h3>
        <p>{currentStageName}. Результаты и начисления проверяются по сохранённым данным, без повторного расчёта.</p></div>
      <label>Тур
        <select value={actualTour} onChange={event=>onSelectTour(event.target.value)}>
          {stageTours.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </label>
    </div>
    {!tour?<p>В текущем этапе пока нет туров с матчами.</p>:<>
      <div className="cutover-tour-metrics">
        <div><small>Матчи завершены</small><strong>{finished.length} / {selected.length}</strong></div>
        <div><small>Прогнозы участников</small><strong>{tableReady?totalPredictions+" / "+expected:"—"}</strong></div>
        <div><small>Начисления по завершённым матчам</small><strong>{tableReady?totalScored+" / "+scoredExpected:"—"}</strong></div>
      </div>
      {!tableReady?<p>Данные о прогнозах и начислениях пока загружаются. Нулевые значения не отображаются до загрузки.</p>:
      <p className="cutover-tour-note">
        {missingPredictions.length?missingPredictions.length+" матч(ей) с недостающими прогнозами. ":"Все прогнозы этого тура на месте. "}
        {incomplete.length?incomplete.length+" завершённых матч(ей) с неполными начислениями. ":"Начисления завершённых матчей полные. "}
        {due.length?due.length+" матч(ей) ожидают ввода результата.":"Нет просроченных матчей без результата."}
      </p>}
      {(incomplete.length>0 || due.length>0 || missingPredictions.length>0) && tableReady &&
        <div className="cutover-tour-issues">
          <strong>Требуют внимания</strong>
          <ul>{diagnostics.filter(item=>item.incomplete||item.due||item.missing.length>0).map(item=>
            <li key={item.match.id}><span>{item.match.home_team} — {item.match.away_team}</span>
              {item.incomplete?<span className="cutover-tour-status is-warning">Проверить начисления ({item.scoredCount} / {participants})</span>:
                item.due?<span className="cutover-tour-status is-warning">Внести результат</span>:
                <span className="cutover-tour-status is-warning">Нет прогноза: {item.missing.join(", ")}</span>}
            </li>)}</ul>
        </div>}
      {tableReady && incomplete.length===0 && due.length===0 && missingPredictions.length===0 &&
        <p className="cutover-tour-status is-success">Проблем не обнаружено. Результаты будущих матчей можно внести в календаре ниже.</p>}
      <p className="cutover-tour-note">Очки не пересчитываются. Даже 0 очков считается начислением, если запись сохранена. Для ввода счёта используй календарь ниже.</p>
    </>}
  </section>;
}
