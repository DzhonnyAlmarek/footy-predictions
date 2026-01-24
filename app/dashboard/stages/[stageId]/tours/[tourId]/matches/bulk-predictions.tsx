"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MatchRow = {
  id: number;
  deadline_at: string;
  home_name: string;
  away_name: string;
  my_home: number | null;
  my_away: number | null;
};

export default function BulkPredictions({ matches }: { matches: MatchRow[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [values, setValues] = useState<Record<number, { h: string; a: string }>>(() => {
    const init: Record<number, { h: string; a: string }> = {};
    for (const m of matches) {
      init[m.id] = {
        h: m.my_home === null || m.my_home === undefined ? "" : String(m.my_home),
        a: m.my_away === null || m.my_away === undefined ? "" : String(m.my_away),
      };
    }
    return init;
  });

  const [savingId, setSavingId] = useState<number | null>(null);
  const [savingAll, setSavingAll] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setOne(id: number, side: "h" | "a", v: string) {
    setValues((prev) => ({
      ...prev,
      [id]: { ...(prev[id] ?? { h: "", a: "" }), [side]: v },
    }));
  }

  function isOpen(deadlineAt: string) {
    return new Date() < new Date(deadlineAt);
  }

  function parseScore(v: { h: string; a: string }) {
    if (v.h === "" || v.a === "") return null;
    const h = Number(v.h);
    const a = Number(v.a);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return "invalid";
    return { h, a };
  }

  async function saveOne(matchId: number) {
    setMsg(null);

    const m = matches.find((x) => x.id === matchId);
    if (!m) return;

    if (!isOpen(m.deadline_at)) {
      setMsg("Дедлайн прошёл — сохранить нельзя");
      return;
    }

    const v = values[matchId] ?? { h: "", a: "" };
    const parsed = parseScore(v);
    if (parsed === null) {
      setMsg("Заполните оба поля счёта");
      return;
    }
    if (parsed === "invalid") {
      setMsg("Введите целые числа 0+");
      return;
    }

    setSavingId(matchId);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setMsg("Нет сессии. Перезайдите.");
        return;
      }

      const { error } = await supabase.from("predictions").upsert(
        {
          match_id: matchId,
          user_id: user.id,
          home_pred: parsed.h,
          away_pred: parsed.a,
        },
        { onConflict: "match_id,user_id" }
      );

      if (error) throw error;

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setSavingId(null);
    }
  }

  async function saveAll() {
    setMsg(null);
    setSavingAll(true);

    try {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) {
        setMsg("Нет сессии. Перезайдите.");
        return;
      }

      // Собираем payload: только открытые матчи + только заполненные и валидные
      const payload: Array<{ match_id: number; user_id: string; home_pred: number; away_pred: number }> = [];
      const invalidIds: number[] = [];

      for (const m of matches) {
        if (!isOpen(m.deadline_at)) continue;

        const v = values[m.id] ?? { h: "", a: "" };
        const parsed = parseScore(v);

        if (parsed === null) continue; // пустые строки пропускаем
        if (parsed === "invalid") {
          invalidIds.push(m.id);
          continue;
        }

        payload.push({
          match_id: m.id,
          user_id: user.id,
          home_pred: parsed.h,
          away_pred: parsed.a,
        });
      }

      if (invalidIds.length > 0) {
        setMsg(`Исправьте счёт (не число) в матчах: ${invalidIds.join(", ")}`);
        return;
      }

      if (payload.length === 0) {
        setMsg("Нет заполненных открытых матчей для сохранения");
        return;
      }

      const { error } = await supabase
        .from("predictions")
        .upsert(payload, { onConflict: "match_id,user_id" });

      if (error) throw error;

      setMsg(`Сохранено ✅ (${payload.length})`);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setSavingAll(false);
    }
  }

  const openCount = matches.filter((m) => isOpen(m.deadline_at)).length;

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>Быстрый ввод прогнозов</div>
          <div style={{ marginTop: 6, opacity: 0.8 }}>
            Открытых матчей: <b>{openCount}</b> • пустые строки игнорируются
          </div>
        </div>

        <button
          type="button"
          onClick={saveAll}
          disabled={savingAll}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            minWidth: 160,
            height: 42,
          }}
          title="Сохранит все заполненные прогнозы по открытым матчам"
        >
          {savingAll ? "..." : "Сохранить все"}
        </button>
      </div>

      {msg && <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>}

      <div style={{ marginTop: 14, display: "grid", gap: 10 }}>
        {matches.map((m) => {
          const deadline = new Date(m.deadline_at);
          const open = isOpen(m.deadline_at);
          const v = values[m.id] ?? { h: "", a: "" };

          return (
            <div
              key={m.id}
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
              <div style={{ minWidth: 260 }}>
                <div style={{ fontWeight: 800 }}>
                  {m.home_name} — {m.away_name}
                </div>
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  дедлайн:{" "}
                  {deadline.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" })} •{" "}
                  <b style={{ color: open ? "inherit" : "crimson" }}>{open ? "открыто" : "закрыто"}</b>
                </div>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input
                  value={v.h}
                  onChange={(e) => setOne(m.id, "h", e.target.value)}
                  inputMode="numeric"
                  disabled={!open || savingAll}
                  style={{ width: 70, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <span style={{ fontWeight: 900 }}>:</span>
                <input
                  value={v.a}
                  onChange={(e) => setOne(m.id, "a", e.target.value)}
                  inputMode="numeric"
                  disabled={!open || savingAll}
                  style={{ width: 70, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />

                <button
                  type="button"
                  onClick={() => saveOne(m.id)}
                  disabled={!open || savingAll || savingId === m.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: !open ? "#777" : "#111",
                    color: "#fff",
                    cursor: !open ? "not-allowed" : "pointer",
                    minWidth: 110,
                  }}
                >
                  {savingId === m.id ? "..." : "Сохранить"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
