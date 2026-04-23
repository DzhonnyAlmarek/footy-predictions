import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

export default async function ArchiveStagesPage() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();

  if (!login) redirect("/");

  const sb = service();

  const { data: stages, error } = await sb
    .from("stages")
    .select("id,name,status,is_current")
    .eq("status", "locked")
    .order("id", { ascending: false });

  return (
    <main className="page">
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <h1>Архив этапов</h1>
        <Link href="/dashboard">← Назад</Link>
      </div>

      <div className="pageMeta">
        Завершённые этапы доступны для просмотра в архиве.
      </div>

      {error ? (
        <p style={{ marginTop: 16, color: "crimson", fontWeight: 800 }}>
          Ошибка загрузки архива: {error.message}
        </p>
      ) : !stages || stages.length === 0 ? (
        <p style={{ marginTop: 16 }}>Завершённых этапов пока нет.</p>
      ) : (
        <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
          {stages.map((s: any) => (
            <div key={s.id} className="card">
              <div className="cardBody" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 900, fontSize: 18 }}>
                    Этап #{s.id}: {s.name}
                    {s.is_current ? <span style={{ marginLeft: 8 }}>⭐</span> : null}
                  </div>
                  <div style={{ marginTop: 6, opacity: 0.8 }}>
                    Статус: <b>{s.status}</b>
                  </div>
                </div>

                <div style={{ alignSelf: "center" }}>
                  <Link
                    href={`/dashboard/archive/${s.id}`}
                    className="btn"
                    style={{ textDecoration: "none" }}
                  >
                    Открыть таблицу
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}