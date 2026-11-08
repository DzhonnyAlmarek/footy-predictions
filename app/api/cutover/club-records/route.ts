import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { authenticatedCutoverIdentity, cutoverAuthEnabled, CUTOVER_COOKIE, CUTOVER_HEADERS } from "@/lib/cutover-participant-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Entry = {
  stage_id: string; stage_name: string; stage_status: string; is_current: boolean;
  tour_id: string; tour_name: string; match_id: string; kickoff_at: string | null;
  home_team: string; away_team: string; home_score: number; away_score: number;
  user_id: string; username: string; points: string;
};
type ClubRecord = { label: string; value: string; holder: string; details: string };
const fmt = (value: number) => Number(value.toFixed(2)).toLocaleString("ru-RU");

// Compute the five summary records on the server. The response is small and
// contains no full prediction history or unnecessary participant details.
function summarize(entries: Entry[]): ClubRecord[] {
  if (!entries.length) return [];
  const sorted = [...entries].sort((a,b) =>
    String(a.kickoff_at ?? "").localeCompare(String(b.kickoff_at ?? "")) ||
    Number(a.match_id)-Number(b.match_id));
  const records: ClubRecord[] = [];
  const bestMatch = [...sorted].sort((a,b) => Number(b.points)-Number(a.points))[0];
  records.push({
    label: "Больше всего очков за матч",
    value: fmt(Number(bestMatch.points))+" оч.", holder: bestMatch.username,
    details: bestMatch.home_team+" — "+bestMatch.away_team+" ("+
      bestMatch.home_score+":"+bestMatch.away_score+"), "+bestMatch.stage_name
  });
  const tours = new Map<string,{username:string;stage_name:string;tour_name:string;points:number;is_current:boolean}>();
  const stages = new Map<string,{username:string;stage_name:string;points:number}>();
  for (const row of sorted) {
    const tk=row.tour_id+"/"+row.user_id;
    const tour=tours.get(tk)??{username:row.username,stage_name:row.stage_name,tour_name:row.tour_name,points:0,is_current:row.is_current};
    tour.points+=Number(row.points); tours.set(tk,tour);
    if(row.stage_status==="locked") {
      const sk=row.stage_id+"/"+row.user_id;
      const stage=stages.get(sk)??{username:row.username,stage_name:row.stage_name,points:0};
      stage.points+=Number(row.points); stages.set(sk,stage);
    }
  }
  const bestTour=[...tours.values()].sort((a,b)=>b.points-a.points)[0];
  if(bestTour) records.push({
    label:"Лучший тур",value:fmt(bestTour.points)+" оч.",holder:bestTour.username,
    details:bestTour.stage_name+", "+bestTour.tour_name+(bestTour.is_current?" (предварительный результат)":"")
  });
  const bestStage=[...stages.values()].sort((a,b)=>b.points-a.points)[0];
  if(bestStage) records.push({
    label:"Больше всего очков за этап",value:fmt(bestStage.points)+" оч.",holder:bestStage.username,
    details:bestStage.stage_name+" (завершён)"
  });
  const streaks=new Map<string,{username:string;current:number;best:number;end:Entry|null}>();
  for(const row of sorted) {
    const item=streaks.get(row.user_id)??{username:row.username,current:0,best:0,end:null};
    item.current=Number(row.points)>0?item.current+1:0;
    if(item.current>item.best){item.best=item.current;item.end=row;}
    streaks.set(row.user_id,item);
  }
  const streak=[...streaks.values()].sort((a,b)=>b.best-a.best)[0];
  if(streak?.best) records.push({
    label:"Самая длинная серия с очками",value:streak.best+" матчей",holder:streak.username,
    details:"Подряд набирал очки в "+streak.best+" матчах; последний матч: "+
      (streak.end?.home_team??"—")+" — "+(streak.end?.away_team??"—")
  });
  const stageRank=new Map<string,{name:string;points:Map<string,number>}>();
  for (const row of sorted.filter(r=>r.stage_status==="locked")) {
    const stage=stageRank.get(row.stage_id)??{name:row.stage_name,points:new Map<string,number>()};
    stage.points.set(row.username,(stage.points.get(row.username)??0)+Number(row.points));
    stageRank.set(row.stage_id,stage);
  }
  const closest=[...stageRank.values()].map(stage=>{
    const ranking=[...stage.points].sort((a,b)=>b[1]-a[1]);
    return {name:stage.name,first:ranking[0],second:ranking[1],
      diff:ranking.length>=2?ranking[0][1]-ranking[1][1]:Infinity};
  }).filter(r=>Number.isFinite(r.diff)).sort((a,b)=>a.diff-b.diff)[0];
  if(closest?.first&&closest.second) records.push({
    label:"Самый напряжённый финиш",value:fmt(closest.diff)+" оч.",
    holder:closest.first[0]+" и "+closest.second[0],
    details:closest.name+": "+fmt(closest.first[1])+" против "+fmt(closest.second[1])+
      ". Отрыв между первым и вторым по очкам, без дополнительных правил определения победителя."
  });
  return records;
}

// Read-only club history. Only officially locked stages and the current stage;
// draft stages and test matches never participate.
export async function GET(req: NextRequest) {
  if (!cutoverAuthEnabled()) return NextResponse.json({ ok: false }, { status: 404, headers: CUTOVER_HEADERS });
  try {
    const identity = await authenticatedCutoverIdentity(req.cookies.get(CUTOVER_COOKIE)?.value);
    if (!identity) return NextResponse.json({ ok: false }, { status: 401, headers: CUTOVER_HEADERS });
    const sql = neon(process.env.CUTOVER_AUTH_DATABASE_URL!);
    const rows = await sql`
      SELECT s.id::text AS stage_id, s.name AS stage_name, s.status AS stage_status,
        s.is_current, t.id::text AS tour_id, t.name AS tour_name,
        m.id::text AS match_id, m.kickoff_at::text AS kickoff_at, m.home_score, m.away_score,
        h.name AS home_team, a.name AS away_team,
        p.id::text AS user_id, p.username,
        l.points
      FROM footy_cutover.points_ledger l
      JOIN footy_cutover.matches m ON m.id=l.match_id
      JOIN footy_cutover.stages s ON s.id=m.stage_id
      JOIN footy_cutover.tours t ON t.id=m.tour_id
      JOIN footy_cutover.profiles p ON p.id=l.user_id
      JOIN footy_cutover.predictions pr ON pr.user_id=p.id AND pr.match_id=m.id
      JOIN footy_cutover.teams h ON h.id=m.home_team_id
      JOIN footy_cutover.teams a ON a.id=m.away_team_id
      WHERE (s.status='locked' OR (s.is_current=true AND s.status='published'))
        AND m.status='finished' AND m.home_score IS NOT NULL AND m.away_score IS NOT NULL
        AND p.username IS NOT NULL AND UPPER(p.username)<>'ADMIN'
        AND LOWER(COALESCE(p.role,''))<>'admin'
        AND NOT EXISTS (SELECT 1 FROM cutover_auth.test_matches x WHERE x.match_id=m.id)
      ORDER BY m.kickoff_at, m.id, p.username
    `;
    return NextResponse.json({ ok: true, records: summarize(rows as Entry[]) }, { headers: CUTOVER_HEADERS });
  } catch (error) {
    // Error codes only; never log session cookies, SQL parameters or credentials.
    console.error("club-records query failed", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ ok: false, error: "unavailable" }, { status: 503, headers: CUTOVER_HEADERS });
  }
}
