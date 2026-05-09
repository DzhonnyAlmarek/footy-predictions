import { createClient } from "@supabase/supabase-js";
import type { CSSProperties } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

function fmt(n: number) {
  const rounded = Math.round(n * 4) / 4;

  return Number.isInteger(rounded)
    ? String(rounded)
    : rounded.toFixed(2).replace(/\.?0+$/, "");
}

const thStyle: CSSProperties = {
  padding: "14px 12px",
  borderBottom: "1px solid #334155",
  whiteSpace: "nowrap",
  fontSize: 14,
};

const tdStyle: CSSProperties = {
  padding: "14px 12px",
  borderBottom: "1px solid #e2e8f0",
  whiteSpace: "nowrap",
};

export default async function GrandPrixPage({
  searchParams,
}: {
  searchParams?: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const selectedSlug = params?.season ?? "";

  const sb = service();

  const { data: seasons } = await sb
    .from("grand_prix_seasons")
    .select("id,name,slug")
    .order("slug", { ascending: false });

  const season =
    seasons?.find((s) => s.slug === selectedSlug) ?? seasons?.[0] ?? null;

  const { data: rounds } = await sb
    .from("grand_prix_rounds")
    .select("id,round_no,name,source_type,stage_id")
    .eq("season_id", season?.id ?? -1)
    .order("round_no", { ascending: true });

  const { data: users } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .not("user_id", "is", null)
    .order("login", { ascending: true });

  const participants = (users ?? []).filter(
    (u) => String(u.login ?? "").trim().toUpperCase() !== "ADMIN"
  );

  const { data: manualScores } = await sb
    .from("grand_prix_manual_scores")
    .select("round_id,user_id,points");

  const stageIds = (rounds ?? [])
    .filter((r) => r.source_type === "stage" && r.stage_id)
    .map((r) => Number(r.stage_id));

  const { data: siteMatches } =
    stageIds.length > 0
      ? await sb.from("matches").select("id,stage_id").in("stage_id", stageIds)
      : { data: [] as any[] };

  const matchIds = (siteMatches ?? []).map((m) => m.id);

  const { data: siteLedger } =
    matchIds.length > 0
      ? await sb
          .from("points_ledger")
          .select("user_id,match_id,points,reason")
          .eq("reason", "prediction")
          .in("match_id", matchIds)
      : { data: [] as any[] };

  const matchStage = new Map<number, number>();

  for (const m of siteMatches ?? []) {
    matchStage.set(Number(m.id), Number(m.stage_id));
  }

  const manualMap = new Map<string, number>();

  for (const s of manualScores ?? []) {
    manualMap.set(`${s.round_id}:${s.user_id}`, Number(s.points ?? 0));
  }

  const stagePointsMap = new Map<string, number>();

  for (const row of siteLedger ?? []) {
    const stageId = matchStage.get(Number(row.match_id));
    if (!stageId) continue;

    const key = `${stageId}:${row.user_id}`;
    const prev = stagePointsMap.get(key) ?? 0;

    stagePointsMap.set(key, prev + Number(row.points ?? 0));
  }

  const rows = participants
    .map((u) => {
      const byRound = (rounds ?? []).map((r) => {
        if (r.source_type === "stage" && r.stage_id) {
          return stagePointsMap.get(`${r.stage_id}:${u.user_id}`) ?? 0;
        }

        return manualMap.get(`${r.id}:${u.user_id}`) ?? 0;
      });

      const total = byRound.reduce((sum, v) => sum + v, 0);

      return {
        userId: u.user_id,
        login: u.login,
        byRound,
        total,
      };
    })
    .sort((a, b) => b.total - a.total || a.login.localeCompare(b.login));

  return (
    <main className="pageWrap">
      <section className="card">
        <h1>🏆 Гран-при</h1>

        <p>
          Сезон: <b>{season?.name ?? "не найден"}</b>
        </p>

        <div
          style={{
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            marginTop: 12,
          }}
        >
          {(seasons ?? []).map((s) => {
            const active = s.id === season?.id;

            return (
              <a
                key={s.id}
                href={`/grand-prix?season=${s.slug}`}
                className="pill"
                style={{
                  fontWeight: active ? 800 : 500,
                  opacity: active ? 1 : 0.75,
                }}
              >
                {s.name}
              </a>
            );
          })}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Итоговая таблица</h2>

        <div
          style={{
            overflowX: "auto",
            borderRadius: 16,
            border: "1px solid #e2e8f0",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              minWidth: 900,
              textAlign: "center",
            }}
          >
            <thead
              style={{
                position: "sticky",
                top: 0,
                zIndex: 2,
                background: "#0f172a",
                color: "#fff",
              }}
            >
              <tr>
                <th style={thStyle}>#</th>

                <th
                  style={{
                    ...thStyle,
                    textAlign: "left",
                    minWidth: 140,
                  }}
                >
                  Участник
                </th>

                {(rounds ?? []).map((r) => (
                  <th key={r.id} style={thStyle}>
                    <div>{r.name}</div>

                    <div
                      style={{
                        fontSize: 11,
                        opacity: 0.7,
                        marginTop: 4,
                        fontWeight: 400,
                      }}
                    >
                      {r.source_type === "stage" ? "сайт" : "ручной"}
                    </div>
                  </th>
                ))}

                <th
                  style={{
                    ...thStyle,
                    background: "#1e293b",
                  }}
                >
                  Итого
                </th>
              </tr>
            </thead>

            <tbody>
              {rows.map((row, idx) => {
                const isLeader = idx === 0;

                return (
                  <tr
                    key={row.userId}
                    style={{
                      background: idx % 2 === 0 ? "#fff" : "#f8fafc",
                    }}
                  >
                    <td style={tdStyle}>
                      <b>
                        {idx === 0
                          ? "🥇"
                          : idx === 1
                          ? "🥈"
                          : idx === 2
                            ? "🥉"
                            : idx + 1}
                      </b>
                    </td>

                    <td
                      style={{
                        ...tdStyle,
                        textAlign: "left",
                        fontWeight: 700,
                      }}
                    >
                      {row.login}
                    </td>

                    {row.byRound.map((points, i) => (
                      <td key={`${row.userId}-${i}`} style={tdStyle}>
                        {fmt(points)}
                      </td>
                    ))}

                    <td
                      style={{
                        ...tdStyle,
                        fontWeight: 800,
                        fontSize: 16,
                        background: isLeader ? "#fef3c7" : "#f8fafc",
                      }}
                    >
                      {fmt(row.total)}
                    </td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={(rounds?.length ?? 0) + 3}
                    style={{
                      padding: 24,
                      textAlign: "center",
                    }}
                  >
                    Данных для Гран-при пока нет.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}