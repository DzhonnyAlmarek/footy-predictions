import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const jsonPath = process.argv[2] || "./rpl_schedule_from_xls.json";
const fullPath = path.resolve(process.cwd(), jsonPath);
const payload = JSON.parse(fs.readFileSync(fullPath, "utf8"));

const tours = payload?.tours ?? [];
if (!Array.isArray(tours) || tours.length === 0) {
  console.error("No tours in JSON");
  process.exit(1);
}

function normName(s) {
  return String(s ?? "")
    .trim()
    .replace(/[«»]/g, "")
    .replace(/\s+/g, " ");
}

async function main() {
  // 1) current stage
  const { data: stage, error: stErr } = await supabase
    .from("stages")
    .select("id,name")
    .eq("is_current", true)
    .maybeSingle();

  if (stErr) throw stErr;
  if (!stage) throw new Error("Current stage not found (stages.is_current=true)");

  // 2) teams map
  const { data: teams, error: tErr } = await supabase.from("teams").select("id,name");
  if (tErr) throw tErr;

  const teamByName = new Map(teams.map((t) => [normName(t.name), t.id]));

  // 3) existing tours in stage
  const { data: existingTours, error: exErr } = await supabase
    .from("tours")
    .select("id,tour_no")
    .eq("stage_id", stage.id);

  if (exErr) throw exErr;

  const tourIdByNo = new Map(existingTours.map((t) => [Number(t.tour_no), t.id]));

  // 4) Determine stage_match_no start
  const { data: maxRow, error: maxErr } = await supabase
    .from("matches")
    .select("stage_match_no")
    .eq("stage_id", stage.id)
    .order("stage_match_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (maxErr) throw maxErr;
  let stageMatchNo = Number(maxRow?.stage_match_no ?? 0);

  // 5) import
  let createdTours = 0;
  let createdMatches = 0;

  for (const t of tours) {
    const tourNo = Number(t.tour_no);
    if (!Number.isFinite(tourNo)) continue;

    // create tour if missing
    let tourId = tourIdByNo.get(tourNo);
    if (!tourId) {
      const { data: insTour, error: insTErr } = await supabase
        .from("tours")
        .insert({ stage_id: stage.id, tour_no: tourNo, name: null })
        .select("id")
        .single();

      if (insTErr) throw insTErr;
      tourId = insTour.id;
      tourIdByNo.set(tourNo, tourId);
      createdTours++;
    }

    // insert matches for this tour
    for (const m of t.matches ?? []) {
      const homeName = normName(m.home);
      const awayName = normName(m.away);

      const homeId = teamByName.get(homeName);
      const awayId = teamByName.get(awayName);

      if (!homeId || !awayId) {
        throw new Error(
          `Team not found in DB. home="${homeName}" (${homeId}), away="${awayName}" (${awayId})`
        );
      }

      stageMatchNo++;

      const { error: insMErr } = await supabase.from("matches").insert({
        stage_id: stage.id,
        tour_id: tourId,
        stage_match_no: stageMatchNo,
        home_team_id: homeId,
        away_team_id: awayId,
        kickoff_at: null,   // дата пустая
        deadline_at: null,  // дата пустая
        status: "scheduled",
        home_score: null,
        away_score: null,
      });

      if (insMErr) throw insMErr;
      createdMatches++;
    }
  }

  console.log(
    `OK. Stage="${stage.name}" (${stage.id}). Created tours: ${createdTours}, matches: ${createdMatches}`
  );
}

main().catch((e) => {
  console.error("IMPORT ERROR:", e?.message ?? e);
  process.exit(1);
});
