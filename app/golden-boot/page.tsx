import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Row = { login: string; exact: number };

function medal(i: number) {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return "";
}

export default async function GoldenBootPage() {
  const supabase = await createClient();

  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/");

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <div className="card">
          <div className="cardHeader">
            <div className="cardTitle">Золотая бутса</div>
            <div className="cardSub">Текущий этап не выбран</div>
          </div>
        </div>
      </main>
    );
  }

  const { data: users } = await supabase
    .from("login_accounts")
    .select("login,user_id")
    .neq("login", "ADMIN")
    .order("login", { ascending: true });

  const userIdToLogin = new Map<string, string>((users ?? []).map((u) => [u.user_id, u.login]));
  const userIds = (users ?? []).map((u) => u.user_id);

  const { data: matches } = await supabase
    .from("matches")
    .select("id,home_score,away_score")
    .eq("stage_id", stage.id)
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  const matchIds = (matches ?? []).map((m) => m.id);

  const { data: preds } = await supabase
    .from("predictions")
    .select("match_id,user_id,home_pred,away_pred")
    .in("match_id", matchIds)
    .in("user_id", userIds);

  const scoreByMatch = new Map<string, { h: number; a: number }>();
  for (const m of matches ?? []) {
    scoreByMatch.set(m.id, { h: Number(m.home_score), a: Number(m.away_score) });
  }

  const exactByLogin = new Map<string, number>();
  for (const p of preds ?? []) {
    const login = userIdToLogin.get(p.user_id);
    if (!login) continue;

    const s = scoreByMatch.get(p.match_id);
    if (!s) continue;

    if (Number(p.home_pred) === s.h && Number(p.away_pred) === s.a) {
      exactByLogin.set(login, (exactByLogin.get(login) ?? 0) + 1);
    }
  }

  const rows: Row[] = (users ?? []).map((u) => ({
    login: u.login,
    exact: exactByLogin.get(u.login) ?? 0,
  }));

  rows.sort((a, b) => (b.exact - a.exact) || a.login.localeCompare(b.login, "ru"));

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div className="card">
        <div className="cardHeader">
          <div className="cardTitle">Золотая бутса</div>
          <div className="cardSub">
            Этап: <b>{stage.name ?? `#${stage.id}`}</b>
            {stage.status ? <span style={{ opacity: 0.65 }}> • {stage.status}</span> : null}
            <span style={{ opacity: 0.65 }}> • сыграно матчей: {matchIds.length}</span>
          </div>
        </div>

        <div className="cardBody">
          <div className="cardSoft" style={{ marginBottom: 16 }}>
            <b>Правило:</b> учитывается только абсолютно точный счёт (например, 2:1 → 2:1)
          </div>

          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: "8px 10px", width: 80 }}>#</th>
                <th style={{ padding: "8px 10px" }}>Участник</th>
                <th style={{ padding: "8px 10px", textAlign: "right" }}>Точных</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const isTop3 = idx < 3;
                return (
                  <tr
                    key={r.login}
                    style={{
                      borderTop: "1px solid rgba(0,0,0,0.08)",
                      background: isTop3 ? "rgba(0,0,0,0.03)" : "transparent",
                    }}
                  >
                    <td style={{ padding: "8px 10px" }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          whiteSpace: "nowrap",
                          fontWeight: 900,
                        }}
                      >
                        <span>{idx + 1}</span>
                        <span>{medal(idx)}</span>
                      </div>
                    </td>

                    <td style={{ padding: "8px 10px", fontWeight: 900 }}>{r.login}</td>

                    <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 900 }}>
                      {r.exact}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div style={{ marginTop: 16, opacity: 0.75 }}>
            <Link href="/dashboard" style={{ textDecoration: "underline" }}>
              Назад в таблицу
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
