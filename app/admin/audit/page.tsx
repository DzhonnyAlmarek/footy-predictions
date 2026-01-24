import { createClient } from "@/lib/supabase/server";

export default async function AdminAuditPage() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("audit_log")
    .select("id,action,entity,entity_id,meta,created_at,actor_user_id")
    .order("created_at", { ascending: false })
    .limit(200);

  const actorIds = Array.from(
    new Set((data ?? []).map((r: any) => r.actor_user_id).filter(Boolean))
  ) as string[];

  const actorMap = new Map<string, string>();

  if (actorIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id,username")
      .in("id", actorIds);

    for (const p of profs ?? []) actorMap.set(p.id, p.username ?? p.id);
  }

  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>
      <header>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Логи</h1>
        <p style={{ marginTop: 6, opacity: 0.8 }}>Audit log действий</p>
      </header>

      {error && <p style={{ marginTop: 16, color: "crimson" }}>Ошибка: {error.message}</p>}

      <section style={{ marginTop: 24 }}>
        {!data || data.length === 0 ? (
          <p>Записей пока нет.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {data.map((r: any) => {
              const who = r.actor_user_id ? actorMap.get(r.actor_user_id) ?? r.actor_user_id : "system";
              const when = new Date(r.created_at).toLocaleString("ru-RU", {
                dateStyle: "medium",
                timeStyle: "short",
              });

              return (
                <div
                  key={r.id}
                  style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 12 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ fontWeight: 900 }}>
                      {r.action} • {r.entity} • {r.entity_id ?? "-"}
                    </div>
                    <div style={{ opacity: 0.75 }}>{when}</div>
                  </div>

                  <div style={{ marginTop: 6, opacity: 0.85 }}>
                    кто: <b>{who}</b>
                  </div>

                  {r.meta && (
                    <pre
                      style={{
                        marginTop: 10,
                        background: "#fafafa",
                        border: "1px solid #eee",
                        borderRadius: 10,
                        padding: 10,
                        overflowX: "auto",
                        fontSize: 12,
                      }}
                    >
                      {JSON.stringify(r.meta, null, 2)}
                    </pre>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
