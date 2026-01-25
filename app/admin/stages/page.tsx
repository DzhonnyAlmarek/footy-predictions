import { createClient } from "@/lib/supabase/server";
import CreateStageForm from "./create-stage-form";
import StageRowActions from "./stage-row-actions";
import SetCurrentStageButton from "./set-current-stage";
import Link from "next/link";

function stageStatusRu(s: string) {
  if (s === "draft") return "Черновик";
  if (s === "published") return "Опубликован";
  if (s === "locked") return "Закрыт";
  return s;
}

export default async function AdminStagesPage() {
  const supabase = await createClient();

  const { data: stages, error } = await supabase
    .from("stages")
    .select("id,name,status,created_at,matches_required,is_current")
    .order("id", { ascending: false })
    .limit(200);

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800 }}>Этапы</h1>
          <p style={{ marginTop: 6, opacity: 0.8 }}>
            Выберите текущий этап вручную (⭐). Он используется в “Текущей таблице” и “Результатах”.
          </p>
        </div>
      </header>

      <section style={{ marginTop: 18 }}>
        <CreateStageForm />
      </section>

      {error && <p style={{ marginTop: 16, color: "crimson" }}>Ошибка: {error.message}</p>}

      <section style={{ marginTop: 24 }}>
        {!stages || stages.length === 0 ? (
          <p>Этапов пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {stages.map((s: any) => (
              <div
                key={s.id}
                style={{
                  border: "1px solid #e5e5e5",
                  borderRadius: 12,
                  padding: 14,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ minWidth: 340 }}>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>
                    #{s.id} • {s.name} {s.is_current ? <span style={{ marginLeft: 6 }}>⭐</span> : null}
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.8 }}>
                    статус: <b>{stageStatusRu(s.status)}</b> • матчей: {s.matches_required}
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.8 }}>
                    создан:{" "}
                    {new Date(s.created_at).toLocaleString("ru-RU", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </div>

                  <div style={{ marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Link href={`/admin/stages/${s.id}/tours`} style={{ textDecoration: "underline" }}>
                      Открыть →
                    </Link>

                    <SetCurrentStageButton stageId={s.id} isCurrent={!!s.is_current} />
                  </div>
                </div>

                <StageRowActions stageId={s.id} initialName={s.name} initialStatus={s.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
