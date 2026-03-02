import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

import CreateMatchForm from "./create-match-form";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

type MatchRow = {
  id: number;
  kickoff_at: string | null;
  stage_match_no: number | null;
  home_score: number | null;
  away_score: number | null;
  home: string;
  away: string;
};

export default async function AdminTourMatchesPage({
  params,
}: {
  params: Promise<{ stageId: string; tourId: string }>;
}) {
  // admin guard
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");
  if (fpLogin !== "ADMIN") redirect("/dashboard");

  const { stageId, tourId } = await params;
  const sid = Number(stageId);
  const tid = Number(tourId);

  const sb = service();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("id", sid)
    .maybeSingle();

  const { data: tour } = await sb
    .from("tours")
    .select("id,stage_id,tour_no,name")
    .eq("id", tid)
    .maybeSingle();

  if (!stage || !tour || Number(tour.stage_id) !== sid) {
    return (
      <main className="page">
        <h1>Матчи тура</h1>
        <p style={{ color: "crimson", fontWeight: 800 }}>
          Тур или этап не найдены (или тур не принадлежит этапу).
        </p>
        <p style={{ marginTop: 12 }}>
          <Link href={`/admin/stages/${sid}/tours`}>← Назад к турам</Link>
        </p>
      </main>
    );
  }

  const { data: matchesRaw, error: mErr } = await sb
    .from("matches")
    .select(
      `
      id,
      tour_id,
      kickoff_at,
      stage_match_no,
      home_score,
      away_score,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .eq("stage_id", sid)
    .eq("tour_id", tid)
    .order("kickoff_at", { ascending: true })
    .order("id", { ascending: true });

  const matches: MatchRow[] =
    (matchesRaw ?? []).map((m: any) => ({
      id: m.id,
      kickoff_at: m.kickoff_at ?? null,
      stage_match_no: m.stage_match_no ?? null,
      home_score: m.home_score ?? null,
      away_score: m.away_score ?? null,
      home: m.home_team?.name ?? "?",
      away: m.away_team?.name ?? "?",
    })) ?? [];

  return (
    <main className="page" style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href={`/admin/stages/${sid}/tours`}>← Назад к турам</Link>
      </p>

      <header style={{ marginTop: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 900 }}>
          Тур {tour.tour_no}
          {tour.name ? ` — ${tour.name}` : ""}{" "}
          <span style={{ opacity: 0.7, fontWeight: 800 }}>
            (Этап #{stage.id}: {stage.name})
          </span>
        </h1>
        <div style={{ marginTop: 6, opacity: 0.85 }}>
          статус этапа: <b>{stage.status}</b> • матчей в туре: <b>{matches.length}</b>
        </div>
      </header>

      {/* ✅ Форма добавления матча */}
      <section style={{ marginTop: 18 }}>
        <CreateMatchForm />
      </section>

      {/* Список матчей */}
      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900 }}>Матчи тура</h2>

        {mErr ? (
          <p style={{ color: "crimson", fontWeight: 800 }}>Ошибка загрузки матчей: {mErr.message}</p>
        ) : matches.length === 0 ? (
          <p style={{ opacity: 0.85 }}>Матчей пока нет — добавь через форму выше.</p>
        ) : (
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {matches.map((m) => {
              const kickoff = m.kickoff_at
                ? new Date(m.kickoff_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })
                : "—";

              const res =
                m.home_score == null || m.away_score == null ? "—" : `${m.home_score}:${m.away_score}`;

              return (
                <div
                  key={m.id}
                  style={{
                    border: "1px solid #e5e5e5",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 900 }}>
                      {m.stage_match_no ?? "—"}. {m.home} — {m.away}{" "}
                      <span style={{ opacity: 0.7 }}>({res})</span>
                    </div>
                    <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12 }}>{kickoff}</div>
                  </div>

                  <div style={{ alignSelf: "center" }}>
                    <Link href={`/match/${m.id}`} style={{ textDecoration: "underline" }}>
                      открыть →
                    </Link>
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