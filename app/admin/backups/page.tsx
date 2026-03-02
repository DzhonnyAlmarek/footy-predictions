import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import RestoreStageBackup from "./restore-stage-backup";

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

type StageRow = { id: number; name: string | null; is_current: boolean | null; status: string | null };

function fileSafeName(s: string) {
  return String(s)
    .trim()
    .replace(/[^\p{L}\p{N}\-_ .]/gu, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export default async function AdminBackupsPage() {
  const cs = await cookies();
  const fpLogin = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (!fpLogin) redirect("/");
  if (fpLogin !== "ADMIN") redirect("/dashboard");

  const sb = service();

  const { data: stages, error } = await sb
    .from("stages")
    .select("id,name,is_current,status")
    .order("is_current", { ascending: false })
    .order("id", { ascending: false });

  const list = (stages ?? []) as StageRow[];
  const current = list.find((s) => !!s.is_current) ?? null;

  return (
    <main className="page" style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <p>
        <Link href="/admin">← Админка</Link>
      </p>

      <h1 style={{ fontSize: 28, fontWeight: 900, marginTop: 8 }}>Бэкапы</h1>
      <p style={{ marginTop: 6, opacity: 0.85 }}>
        Здесь можно скачать JSON-бэкап этапа (матчи/туры/прогнозы + опционально ledger).
      </p>

      {error ? (
        <p style={{ marginTop: 14, color: "crimson", fontWeight: 800 }}>Ошибка загрузки этапов: {error.message}</p>
      ) : null}

      <section style={{ marginTop: 18 }}>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 900 }}>Бэкап текущего этапа</div>

          <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <form action="/api/admin/backup/stage" method="post">
              {/* HTML form не умеет JSON body, поэтому скачивание делаем через маленький fetch-клиент ниже */}
              <button
                type="button"
                disabled={!current}
                onClick={async () => {
                  if (!current) return;
                  const res = await fetch("/api/admin/backup/stage", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ stageId: current.id, includeLedger: true }),
                  });

                  if (!res.ok) {
                    const j = await res.json().catch(() => ({}));
                    alert(j?.message ? `${j.error}: ${j.message}` : (j?.error ?? `Ошибка (${res.status})`));
                    return;
                  }

                  const blob = await res.blob();
                  const cd = res.headers.get("content-disposition") ?? "";
                  const m = /filename="([^"]+)"/.exec(cd);
                  const filename =
                    m?.[1] ?? fileSafeName(`stage-${current.id}-${current.name ?? "backup"}.json`);

                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: current ? "pointer" : "not-allowed",
                  opacity: current ? 1 : 0.6,
                }}
                title={current ? "Скачать JSON" : "Нет текущего этапа"}
              >
                Скачать JSON текущего этапа
              </button>
            </form>

            <span style={{ fontSize: 12, opacity: 0.75 }}>
              {current ? (
                <>
                  Текущий этап: <b>#{current.id}</b> {current.name ? `— ${current.name}` : ""}{" "}
                  {current.status ? <span>• статус: <b>{current.status}</b></span> : null}
                </>
              ) : (
                <>Текущий этап не выбран</>
              )}
            </span>
          </div>

          <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
            В бэкап входят: <b>stage, tours, matches, predictions, teams</b> и (по умолчанию) <b>points_ledger</b>.
            Если ledger сломается — его можно пересчитать, имея результаты матчей и прогнозы.
          </div>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
          <div style={{ fontWeight: 900 }}>Все этапы</div>

          {list.length === 0 ? (
            <p style={{ marginTop: 10, opacity: 0.85 }}>Этапов нет.</p>
          ) : (
            <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
              {list.map((s) => (
                <div
                  key={s.id}
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontWeight: 900 }}>
                    #{s.id} {s.name ? `— ${s.name}` : ""}
                    {s.is_current ? <span title="Текущий этап"> ⭐</span> : null}
                    {s.status ? <span style={{ opacity: 0.7, fontWeight: 800 }}> • {s.status}</span> : null}
                  </div>

                  <button
                    type="button"
                    onClick={async () => {
                      const res = await fetch("/api/admin/backup/stage", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ stageId: s.id, includeLedger: true }),
                      });

                      if (!res.ok) {
                        const j = await res.json().catch(() => ({}));
                        alert(j?.message ? `${j.error}: ${j.message}` : (j?.error ?? `Ошибка (${res.status})`));
                        return;
                      }

                      const blob = await res.blob();
                      const cd = res.headers.get("content-disposition") ?? "";
                      const m = /filename="([^"]+)"/.exec(cd);
                      const filename = m?.[1] ?? fileSafeName(`stage-${s.id}-${s.name ?? "backup"}.json`);

                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = filename;
                      document.body.appendChild(a);
                      a.click();
                      a.remove();
                      URL.revokeObjectURL(url);
                    }}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#fff",
                      fontWeight: 900,
                    }}
                  >
                    Скачать JSON
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
<section style={{ marginTop: 18 }}>
  <RestoreStageBackup />
</section>