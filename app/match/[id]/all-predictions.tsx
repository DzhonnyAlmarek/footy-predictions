import { createClient } from "@/lib/supabase/server";

export default async function AllPredictions({ matchId, deadlineAt }: { matchId: number; deadlineAt: string }) {
  const supabase = await createClient();
  const deadline = new Date(deadlineAt);

  if (new Date() < deadline) {
    return (
      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 12 }}>
        <b>Все прогнозы</b>
        <p style={{ marginTop: 8, opacity: 0.8 }}>
          Доступно после дедлайна.
        </p>
      </div>
    );
  }

  const { data, error } = await supabase
    .from("predictions")
    .select(
      `
      id,
      home_pred,
      away_pred,
      updated_at,
      profiles ( username )
    `
    )
    .eq("match_id", matchId)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    return (
      <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 12 }}>
        <b>Все прогнозы</b>
        <p style={{ marginTop: 8, color: "crimson" }}>Ошибка: {error.message}</p>
      </div>
    );
  }

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    username: r.profiles?.username ?? "user",
    home: r.home_pred,
    away: r.away_pred,
    updated_at: r.updated_at,
  }));

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14, marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <b>Все прогнозы</b>
        <span style={{ opacity: 0.8 }}>всего: {rows.length}</span>
      </div>

      {rows.length === 0 ? (
        <p style={{ marginTop: 10, opacity: 0.8 }}>Прогнозов пока нет.</p>
      ) : (
        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
          {rows.map((r) => (
            <div
              key={r.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                border: "1px solid #eee",
                borderRadius: 10,
              }}
            >
              <div style={{ fontWeight: 700 }}>{r.username}</div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>
                {r.home}:{r.away}
              </div>
              <div style={{ opacity: 0.7, fontSize: 12 }}>
                {new Date(r.updated_at).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
