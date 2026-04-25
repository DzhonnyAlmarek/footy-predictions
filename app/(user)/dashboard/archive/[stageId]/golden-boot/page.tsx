import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
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

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

export default async function ArchiveGoldenBootPage({
  params,
}: {
  params: Promise<{ stageId: string }>;
}) {
  const cs = await cookies();
  const raw = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(raw).trim();

  if (!fpLogin) redirect("/");

  const { stageId } = await params;
  const sid = Number(stageId);

  if (!Number.isFinite(sid)) redirect("/dashboard/archive");

  const supabase = await createClient();

  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("id", sid)
    .maybeSingle();

  if (!stage || stage.status !== "locked") {
    return (
      <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
        <div className="card">
          <div className="cardHeader">
            <div className="cardTitle">Архивная золотая бутса</div>
            <div className="cardSub">Этап не найден или ещё не завершён</div>
          </div>
          <div className="cardBody">
            <Link href="/dashboard/archive" style={{ textDecoration: "underline" }}>
              ← Назад к архиву
            </Link>
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

  const userIdToLogin = new Map<string, string>(
    (users ?? []).map((u: any) => [u.user_id, u.login])
  );

  const userIds = (users ?? []).map((u: any) => u.user_id);

  const { data: matches } = await supabase
    .from("matches")
    .select("id,home_score,away_score")
    .eq("stage_id", sid)
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  const matchIds = (matches ?? []).map((m: any) => m.id);

  const { data: preds } =
    matchIds.length > 0 && userIds.length > 0
      ? await supabase
          .from("predictions")
          .select("match_id,user_id,home_pred,away_pred")
          .in("match_id", matchIds)
          .in("user_id", userIds)
      : { data: [] as any[] };

  const scoreByMatch = new Map<string, { h: number; a: number }>();

  for (const m of matches ?? []) {
    scoreByMatch.set(String(m.id), {
      h: Number(m.home_score),
      a: Number(m.away_score),
    });
  }

  const exactByLogin = new Map<string, number>();

  for (const p of preds ?? []) {
    const login = userIdToLogin.get(String(p.user_id));
    if (!login) continue;

    const s = scoreByMatch.get(String(p.match_id));
    if (!s) continue;

    if (Number(p.home_pred) === s.h && Number(p.away_pred) === s.a) {
      exactByLogin.set(login, (exactByLogin.get(login) ?? 0) + 1);
    }
  }

  const rows: Row[] = (users ?? []).map((u: any) => ({
    login: u.login,
    exact: exactByLogin.get(u.login) ?? 0,
  }));

  rows.sort((a, b) => b.exact - a.exact || a.login.localeCompare(b.login, "ru"));

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <div className="card">
        <div className="cardHeader">
          <div className="cardTitle">Архивная золотая бутса</div>
          <div className="cardSub">
            Этап: <b>{stage.name ?? `#${stage.id}`}</b>
            <span style={{ opacity: 0.65 }}> • завершён</span>
            <span style={{ opacity: 0.65 }}> • сыграно матчей: {matchIds.length}</span>
          </div>
        </div>

        <div className="cardBody">
          <div className="cardSoft" style={{ marginBottom: 16 }}>
            <b>Правило:</b> учитывается только абсолютно точный счёт.
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

          <div style={{ marginTop: 16, display: "flex", gap: 14, flexWrap: "wrap", opacity: 0.8 }}>
            <Link href={`/dashboard/archive/${sid}`} style={{ textDecoration: "underline" }}>
              ← Архивная таблица
            </Link>

            <Link href="/dashboard/archive" style={{ textDecoration: "underline" }}>
              Все архивы
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}