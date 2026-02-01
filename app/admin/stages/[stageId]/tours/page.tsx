import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import CreateTourForm from "./create-tour-form";
import PublishStage from "./publish-stage";
import TourRowActions from "./tour-row-actions";
import StageActions from "./stage-actions";
import SetCurrentStageButton from "./set-current-stage";

type MatchRow = {
  id: number;
  tour_id: number;
  stage_match_no: number | null;
  kickoff_at: string;
  home: string;
  away: string;
};

function stageStatusRu(s: string) {
  if (s === "draft") return "Черновик";
  if (s === "published") return "Опубликован";
  if (s === "locked") return "Закрыт";
  return s;
}

export default async function AdminStageToursPage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const { stageId } = await params;
  const sid = Number(stageId);

  const supabase = await createClient();

  const { data: stage, error: stageErr } = await supabase
    .from("stages")
    .select("id,name,status,matches_required,is_current")
    .eq("id", sid)
    .single();

  if (stageErr || !stage) {
    return (
      <main style={{ padding: 24 }}>
        <p style={{ color: "crimson" }}>Этап не найден: {stageErr?.message}</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/admin/stages">← К этапам</Link>
        </p>
      </main>
    );
  }

  const { data: tours, error } = await supabase
    .from("tours")
    .select("id,stage_id,tour_no,name,created_at")
    .eq("stage_id", sid)
    .order("tour_no", { ascending: true });

  const { count: matchCount } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("stage_id", sid);

  const matchCountSafe = matchCount ?? 0;

  const { data: matches } = await supabase
    .from("matches")
    .select(
      `
      id,
      tour_id,
      stage_match_no,
      kickoff_at,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", sid)
    .order("tour_id", { ascending: true })
    .order("kickoff_at", { ascending: true });

  const matchList: MatchRow[] =
    (matches ?? []).map((m: any) => ({
      id: m.id,
      tour_id: m.tour_id,
      stage_match_no: m.stage_match_no ?? null,
      kickoff_at: m.kickoff_at,
      home: m.home_team?.name ?? "?",
      away: m.away_team?.name ?? "?",
    })) ?? [];

  const matchesByTour = new Map<number, MatchRow[]>();
  for (const m of matchList) {
    matchesByTour.set(m.tour_id, [...(matchesByTour.get(m.tour_id) ?? []), m]);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href="/admin/stages">← К этапам</Link>
      </p>

      <header style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>
          Этап #{stage.id}: {stage.name}{" "}
          {stage.is_current ? <span title="Текущий этап">⭐</span> : null}
        </h1>
        <p style={{ marginTop: 6, opacity: 0.85 }}>
          статус: <b>{stageStatusRu(stage.status)}</b> • матчей:{" "}
          <b>{matchCountSafe}</b> / {stage.matches_required}
        </p>
      </header>

      <section style={{ marginTop: 12 }}>
        <SetCurrentStageButton stageId={sid} isCurrent={!!stage.is_current} />
      </section>

      <section style={{ marginTop: 18 }}>
        <StageActions stageId={sid} initialName={stage.name} initialStatus={stage.status} />
      </section>

      <section style={{ marginTop: 18 }}>
        <PublishStage
          stageId={sid}
          stageStatus={stage.status}
          matchCount={matchCountSafe}
          required={stage.matches_required}
        />
      </section>

      <section style={{ marginTop: 18 }}>
        <CreateTourForm stageId={sid} />
      </section>

      {error && (
        <p style={{ marginTop: 16, color: "crimson" }}>Ошибка туров: {error.message}</p>
      )}

      <section style={{ marginTop: 24 }}>
        {!tours || tours.length === 0 ? (
          <p>Туров пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {tours.map((t: any) => {
              const tMatches = matchesByTour.get(t.id) ?? [];

              return (
                <div
                  key={t.id}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 14,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      alignItems: "flex-start",
                    }}
                  >
                    <div style={{ minWidth: 320 }}>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        Тур {t.tour_no}
                        {t.name ? ` — ${t.name}` : ""}{" "}
                        <span style={{ opacity: 0.7, fontWeight: 700 }}>
                          (матчей: {tMatches.length})
                        </span>
                      </div>

                      <div style={{ marginTop: 6, opacity: 0.8 }}>
                        создан:{" "}
                        {new Date(t.created_at).toLocaleString("ru-RU", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>

                      <div style={{ marginTop: 10 }}>
                        <Link
                          href={`/admin/stages/${sid}/tours/${t.id}/matches`}
                          style={{ textDecoration: "underline" }}
                        >
                          Управлять матчами тура →
                        </Link>
                      </div>
                    </div>

                    <div style={{ minWidth: 320 }}>
                      <TourRowActions
                        tourId={t.id}
                        stageStatus={stage.status}
                        initialNo={t.tour_no}
                        initialName={t.name ?? null}
                      />
                    </div>
                  </div>

                  <div style={{ marginTop: 14, borderTop: "1px solid #eee", paddingTop: 12 }}>
                    {tMatches.length === 0 ? (
                      <div style={{ opacity: 0.8 }}>Матчей в туре пока нет.</div>
                    ) : (
                      <div style={{ display: "grid", gap: 8 }}>
                        {tMatches.map((m) => {
                          const kickoff = new Date(m.kickoff_at).toLocaleString("ru-RU", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          });

                          return (
                            <div
                              key={m.id}
                              style={{
                                border: "1px solid #eee",
                                borderRadius: 10,
                                padding: "10px 12px",
                                display: "flex",
                                justifyContent: "space-between",
                                gap: 12,
                                flexWrap: "wrap",
                              }}
                            >
                              <div>
                                <div style={{ fontWeight: 800 }}>
                                  {m.stage_match_no ?? "—"}. {m.home} — {m.away}
                                </div>
                                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12 }}>
                                  {kickoff} •{" "}
                                  <Link href={`/match/${m.id}`} style={{ textDecoration: "underline" }}>
                                    открыть
                                  </Link>
                                </div>
                              </div>

                              <div style={{ alignSelf: "center" }}>
                                <Link
                                  href={`/admin/stages/${sid}/tours/${t.id}/matches`}
                                  style={{ textDecoration: "underline" }}
                                >
                                  редактировать →
                                </Link>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
