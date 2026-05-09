import { createClient } from "@supabase/supabase-js";
import GrandPrixSourceForm from "./GrandPrixSourceForm";

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

export default async function AdminGrandPrixPage({
  searchParams,
}: {
  searchParams?: Promise<{ season?: string }>;
}) {
  const params = await searchParams;
  const selectedSlug = params?.season ?? "2025-2026";

  const sb = service();

  const { data: seasons } = await sb
    .from("grand_prix_seasons")
    .select("id,name,slug")
    .order("slug", { ascending: false });

  const season =
    seasons?.find((s) => s.slug === selectedSlug) ?? seasons?.[0] ?? null;

  const seasonSlug = season?.slug ?? selectedSlug;

  const { data: rounds } = await sb
    .from("grand_prix_rounds")
    .select("id,round_no,name,source_type,stage_id")
    .eq("season_id", season?.id ?? -1)
    .order("round_no", { ascending: true });

  const { data: siteStages } = await sb
    .from("stages")
    .select("id,name,status,is_current")
    .order("id", { ascending: true });

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

  return (
    <main>
      <section className="card">
        <h1>🏆 Гран-при</h1>

        <p>
          Настройка сезона: <b>{season?.name ?? "не найден"}</b>
        </p>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Сезоны</h2>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(seasons ?? []).map((s) => (
            <a
              key={s.id}
              href={`/admin/grand-prix?season=${s.slug}`}
              className="pill"
              style={{
                fontWeight: s.slug === seasonSlug ? 800 : 500,
                opacity: s.slug === seasonSlug ? 1 : 0.75,
              }}
            >
              {s.name}
            </a>
          ))}
        </div>

        <form
          action="/api/admin/grand-prix"
          method="post"
          style={{
            marginTop: 16,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <input type="hidden" name="action" value="createSeason" />

          <input
            name="name"
            placeholder="Сезон 2026–2027"
            required
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
            }}
          />

          <input
            name="slug"
            placeholder="2026-2027"
            style={{
              padding: 8,
              borderRadius: 8,
              border: "1px solid #cbd5e1",
            }}
          />

          <button type="submit" className="pill">
            Добавить сезон
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Источники этапов</h2>

        <div style={{ display: "grid", gap: 12 }}>
          {(rounds ?? []).map((r) => (
            <GrandPrixSourceForm
              key={r.id}
              round={r}
              siteStages={siteStages ?? []}
              seasonSlug={seasonSlug}
            />
          ))}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <h2>Ручной ввод очков</h2>

        <p style={{ marginTop: 0 }}>
          Поля активны только для этапов с источником <b>Ручной ввод</b>.
        </p>

        <div style={{ overflowX: "auto" }}>
          <table className="currentTable">
            <thead>
              <tr>
                <th>Участник</th>

                {(rounds ?? []).map((r) => (
                  <th key={r.id}>
                    {r.name}
                    <br />
                    <small>{r.source_type === "stage" ? "этап сайта" : "ручной"}</small>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {participants.map((u) => (
                <tr key={u.user_id}>
                  <td>
                    <b>{u.login}</b>
                  </td>

                  {(rounds ?? []).map((r) => {
                    const saved = (manualScores ?? []).find(
                      (s) => s.round_id === r.id && s.user_id === u.user_id
                    );

                    const isStage = r.source_type === "stage";

                    return (
                      <td key={`${r.id}-${u.user_id}`}>
                        {isStage ? (
                          <span style={{ color: "#64748b" }}>
                            считается из этапа сайта
                          </span>
                        ) : (
                          <form
                            action="/api/admin/grand-prix"
                            method="post"
                            style={{
                              display: "flex",
                              gap: 8,
                              alignItems: "center",
                            }}
                          >
                            <input type="hidden" name="action" value="saveManualScore" />
                            <input type="hidden" name="seasonSlug" value={seasonSlug} />
                            <input type="hidden" name="roundId" value={r.id} />
                            <input type="hidden" name="userId" value={u.user_id} />

                            <input
                              name="points"
                              type="number"
                              step="0.25"
                              defaultValue={saved?.points ?? 0}
                              style={{
                                width: 90,
                                padding: 8,
                                borderRadius: 8,
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                color: "#111827",
                              }}
                            />

                            <button type="submit" className="pill">
                              OK
                            </button>
                          </form>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {participants.length === 0 ? (
                <tr>
                  <td colSpan={(rounds?.length ?? 0) + 1}>
                    Участники не найдены
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