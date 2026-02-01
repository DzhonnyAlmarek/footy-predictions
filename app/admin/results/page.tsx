export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import ResultsEditor from "./results-editor";

export default async function AdminResultsPage() {
  const supabase = await createClient();

  try {
    // текущий этап
    const { data: stage, error: stErr } = await supabase
      .from("stages")
      .select("id,name,status")
      .eq("is_current", true)
      .maybeSingle();

    if (stErr) throw stErr;
    if (!stage) {
      return (
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
          <h1 style={{ fontSize: 28, fontWeight: 900 }}>Результаты</h1>
          <p style={{ marginTop: 10, opacity: 0.8 }}>Текущий этап не выбран.</p>
        </main>
      );
    }

    // матчи этапа (для редактора результатов)
    const { data: matches, error: mErr } = await supabase
      .from("matches")
      .select(
        `
        id,stage_id,tour_id,stage_match_no,kickoff_at,deadline_at,status,
        home_score,away_score,
        home_team:teams!matches_home_team_id_fkey(name),
        away_team:teams!matches_away_team_id_fkey(name)
      `
      )
      .eq("stage_id", stage.id)
      .order("tour_id", { ascending: true })
      .order("kickoff_at", { ascending: true });

    if (mErr) throw mErr;

    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Результаты — {stage.name}</h1>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Здесь админ выставляет итоговый счёт матча.
        </p>

        <section style={{ marginTop: 16 }}>
          <ResultsEditor stageId={stage.id} initialMatches={matches ?? []} />
        </section>
      </main>
    );
  } catch (e: any) {
    // ✅ вместо “Что-то пошло не так” покажем реальную ошибку
    const msg =
      e?.message ??
      (typeof e === "string" ? e : "Неизвестная ошибка на странице /admin/results");

    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>Результаты</h1>

        <div
          style={{
            marginTop: 12,
            border: "1px solid rgba(220,38,38,0.3)",
            background: "rgba(220,38,38,0.06)",
            borderRadius: 12,
            padding: 12,
          }}
        >
          <div style={{ fontWeight: 900, color: "crimson" }}>Ошибка на /admin/results</div>
          <pre style={{ marginTop: 8, whiteSpace: "pre-wrap", opacity: 0.9 }}>{msg}</pre>
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/admin" style={{ textDecoration: "underline", fontWeight: 800 }}>
            В админку
          </Link>
          <Link href="/logout" style={{ textDecoration: "underline", fontWeight: 800 }}>
            Выйти
          </Link>
        </div>
      </main>
    );
  }
}
