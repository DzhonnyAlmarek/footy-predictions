"use client";

import { useEffect, useMemo, useState } from "react";

type Entry = {
  stage_id: string; stage_name: string; stage_status: string; is_current: boolean;
  tour_id: string; tour_name: string; match_id: string; kickoff_at: string;
  home_team: string; away_team: string; home_score: number; away_score: number;
  user_id: string; username: string; home_pred: number; away_pred: number; points: string;
};
type RecordItem = { label: string; value: string; holder: string; details: string };
const format = (v: number) => Number(v.toFixed(2)).toLocaleString("ru-RU");

export default function ClubRecords() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/cutover/club-records", { cache: "no-store" })
      .then(async res => { if (!res.ok) throw new Error("club-records"); return res.json(); })
      .then(data => { if (!cancelled) { if (!data.ok || !Array.isArray(data.rows)) throw new Error("club-records"); setEntries(data.rows); } })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, []);

  const records = useMemo(() => {
    if (!entries?.length) return [] as RecordItem[];
    const sorted = [...entries].sort((a,b) =>
      a.kickoff_at.localeCompare(b.kickoff_at) ||
      Number(a.match_id)-Number(b.match_id));
    const result: RecordItem[] = [];
    const bestMatch = [...sorted].sort((a,b)=>Number(b.points)-Number(a.points))[0];
    if (bestMatch) result.push({
      label:"Больше всего очков за матч", value:format(Number(bestMatch.points))+" оч.",
      holder: bestMatch.username,
      details:bestMatch.home_team+" — "+bestMatch.away_team+" ("+
        bestMatch.home_score+":"+bestMatch.away_score+"), "+bestMatch.stage_name
    });

    const tours = new Map<string,{username:string;stage_name:string;tour_name:string;points:number;is_current:boolean}>();
    const stages = new Map<string,{username:string;stage_name:string;points:number;status:string}>();
    for(const row of sorted) {
      const tk=row.tour_id+"/"+row.user_id;
      const tour=tours.get(tk)??{username:row.username,stage_name:row.stage_name,tour_name:row.tour_name,points:0,is_current:row.is_current};
      tour.points+=Number(row.points); tours.set(tk,tour);
      // Stage records count only officially closed stages, not interim totals.
      if(row.stage_status==="locked"){
        const sk=row.stage_id+"/"+row.user_id;
        const stage=stages.get(sk)??{username:row.username,stage_name:row.stage_name,points:0,status:row.stage_status};
        stage.points+=Number(row.points); stages.set(sk,stage);
      }
    }
    const bestTour=[...tours.values()].sort((a,b)=>b.points-a.points)[0];
    if(bestTour) result.push({
      label:"Лучший тур",value:format(bestTour.points)+" оч.",holder:bestTour.username,
      details:bestTour.stage_name+", "+bestTour.tour_name+(bestTour.is_current?" (текущий этап, результат предварительный)":"")
    });
    const bestStage=[...stages.values()].sort((a,b)=>b.points-a.points)[0];
    if(bestStage)result.push({
      label:"Больше всего очков за этап",value:format(bestStage.points)+" оч.",holder:bestStage.username,
      details:bestStage.stage_name+" (завершён)"
    });

    const streaks=new Map<string,{username:string;current:number;best:number;end:Entry|null}>();
    for(const row of sorted){
      const prev=streaks.get(row.user_id)??{username:row.username,current:0,best:0,end:null};
      prev.current=Number(row.points)>0?prev.current+1:0;
      if(prev.current>prev.best){prev.best=prev.current;prev.end=row;}
      streaks.set(row.user_id,prev);
    }
    const bestStreak=[...streaks.values()].sort((a,b)=>b.best-a.best)[0];
    if(bestStreak?.best)result.push({
      label:"Самая длинная серия с очками",
      value:bestStreak.best+" матчей",holder:bestStreak.username,
      details:"Подряд набирал очки в "+bestStreak.best+" матчах; последний матч серии: "+
        (bestStreak.end?.home_team??"—")+" — "+(bestStreak.end?.away_team??"—")
    });

    const stageRank=new Map<string,{name:string;points:Map<string,number>}>();
    for(const row of sorted.filter(r=>r.stage_status==="locked")){
      const stage=stageRank.get(row.stage_id)??{name:row.stage_name,points:new Map<string,number>()};
      stage.points.set(row.username,(stage.points.get(row.username)??0)+Number(row.points));
      stageRank.set(row.stage_id,stage);
    }
    const closest=[...stageRank.values()].map(stage=>{
      const ranking=[...stage.points].sort((a,b)=>b[1]-a[1]);
      return {name:stage.name,first:ranking[0],second:ranking[1],diff:ranking.length>=2?ranking[0][1]-ranking[1][1]:Infinity};
    }).filter(r=>Number.isFinite(r.diff)).sort((a,b)=>a.diff-b.diff)[0];
    if(closest?.first&&closest.second) result.push({
      label:"Самый напряжённый финиш",value:format(closest.diff)+" оч.",
      holder:closest.first[0]+" и "+closest.second[0],
      details:closest.name+": "+format(closest.first[1])+" против "+format(closest.second[1])+
        ". Показан минимальный отрыв между первым и вторым по очкам; без дополнительных правил разрешения равенства."
    });
    return result;
  }, [entries]);

  return <section style={{marginTop:28}}>
    <h3>Рекорды клуба</h3>
    <p>Исторические достижения за все завершённые этапы и уже сыгранные матчи текущего этапа. Черновики и тестовые матчи не учитываются. Рекорды не дают дополнительных очков или наград.</p>
    {failed?<p>Рекорды временно недоступны.</p>:entries===null?<p>Загружаем историю клуба…</p>:
      records.length===0?<p>Пока нет данных для рекордов.</p>:
      <div className="tableWrap"><table className="table">
        <thead><tr><th>Рекорд</th><th>Значение</th><th>Участник</th><th>Когда и где</th></tr></thead>
        <tbody>{records.map(item=><tr key={item.label}>
          <td><strong>{item.label}</strong></td><td>{item.value}</td>
          <td>{item.holder}</td><td>{item.details}</td>
        </tr>)}</tbody>
      </table></div>}
    <small>При равных достижениях в таблице показан один рекордсмен. Результаты текущего незавершённого этапа могут измениться.</small>
  </section>;
}
