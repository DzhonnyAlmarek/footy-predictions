import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function UserStageToursPage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const { stageId } = await params;
  const sid = Number(stageId);

  const supabase = await createClient();

  // пользователь нужен для прогресса (его layout гарантирует, но здесь получим id)
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;

  // только published этап
  const { data: stage, error: stageErr } = await supabase
    .from("stages")
    .select("id,name,status,matches_required")
    .eq("id", sid)
    .eq("status", "published")
    .single();

  if (stageErr || !stage) {
    return (
      <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
        <p style={{ color: "crimson" }}>Этап не найден или не опубликован.</p>
        <p style={{ marginTop: 12 }}>
          <Link href="/dashboard/stages">← К этапам</Link>
        </p>
      </main>
    );
  }

  const { data: tours, error } = await supabase
    .from("tours")
    .select("id,stage_id,tour_no,name")
    .eq("stage_id", sid)
    .order("tour_no", { ascending: true });

  // Матчи этапа (для подсчёта матчей по турам)
  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select("id,tour_id")
    .eq("stage_id", sid);

  // Прогнозы пользователя по матчам этапа
  const { data: preds, error: pErr } = await supabase
    .from("predictions")
    .select("match_id")
    .eq("user_id", user?.id ?? "00000000-0000-0000-0000-000000000000");

  const matchesByTour = new Map<number, number>();
  for (const m of matches ?? []) {
    if (!m.tour_id) continue;
    matchesByTour.set(m.tour_id, (matchesByTour.get(m.tour_id) ?? 0) + 1);
  }

  const predictedSet = new Set<number>((preds ?? []).map((p: any) => p.match_id));

  // для подсчёта прогноза по турам нужно знать match_id->tour_id
  const matchToTour = new Map<number, number>();
  for (const m of matches ?? []) {
    if (!m.tour_id) continue;
    matchToTour.set(m.id, m.tour_id);
  }

  const predictedByTour = new Map<number, number>();
  for (const mid of predictedSet) {
    const tid = matchToTour.get(mid);
    if (!tid) continue;
    predictedByTour.set(tid, (predictedByTour.get(tid) ?? 0) + 1);
  }

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href="/dashboard/stages">← К этапам</Link>
      </p>

      <header style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>{stage.name}</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>
          Этап #{stage.id} • матчей: {stage.matches_required}
        </p>
      </header>

      {(error || mErr || pErr) && (
        <p style={{ marginTop: 16, color: "crimson" }}>
          Ошибка: {error?.message ?? mErr?.message ?? pErr?.message}
        </p>
      )}

      <section style={{ marginTop: 24 }}>
        {!tours || tours.length === 0 ? (
          <p>Туров пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {tours.map((t: any) => {
              const total = matchesByTour.get(t.id) ?? 0;
              const done = predictedByTour.get(t.id) ?? 0;

              return (
                <Link
                  key={t.id}
                  href={`/dashboard/stages/${sid}/tours/${t.id}/matches`}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 14,
                    textDecoration: "none",
                    color: "inherit",
                    display: "block",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div>
                      <div style={{ fontSize: 18, fontWeight: 800 }}>
                        Тур {t.tour_no}{t.name ? ` — ${t.name}` : ""}
                      </div>
                      <div style={{ marginTop: 6, opacity: 0.8 }}>
                        Матчей: {total} • Прогнозов: {done}
                      </div>
                    </div>

                    <div style={{ alignSelf: "center", textAlign: "right" }}>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>
                        {done} / {total}
                      </div>
                      <div style={{ marginTop: 4, opacity: 0.8, textDecoration: "underline" }}>
                        Открыть →
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
