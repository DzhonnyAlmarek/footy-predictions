"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Row = {
  id: number;
  stageMatchNo: number | null;
  kickoffAt: string;
  homeName: string;
  awayName: string;
  homeScore: number | null;
  awayScore: number | null;
};

export default function ResultsEditor({ matches }: { matches: Row[] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [vals, setVals] = useState<Record<number, { h: string; a: string }>>(() => {
    const init: Record<number, { h: string; a: string }> = {};
    for (const m of matches) {
      init[m.id] = {
        h: m.homeScore === null || m.homeScore === undefined ? "" : String(m.homeScore),
        a: m.awayScore === null || m.awayScore === undefined ? "" : String(m.awayScore),
      };
    }
    return init;
  });

  const [savingId, setSavingId] = useState<number | null>(null);
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set());
  const [bulkSaving, setBulkSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function setOne(id: number, side: "h" | "a", v: string) {
    setVals((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { h: "", a: "" }), [side]: v } }));
    setSavedIds((prev) => {
      const next = new Set(prev);
      next.delete(id); // если изменили — сбрасываем "успешно"
      return next;
    });
  }

  function parseScore(v: { h: string; a: string }) {
    if (v.h === "" || v.a === "") return null;
    const h = Number(v.h);
    const a = Number(v.a);
    if (!Number.isInteger(h) || !Number.isInteger(a) || h < 0 || a < 0) return "invalid";
    return { h, a };
  }

  async function saveOne(id: number) {
    setMsg(null);

    const v = vals[id] ?? { h: "", a: "" };
    const parsed = parseScore(v);
    if (parsed === null) return setMsg("Введите счёт (оба числа)");
    if (parsed === "invalid") return setMsg("Счёт должен быть целыми числами 0+");

    setSavingId(id);
    try {
      // 1) сохраняем результат + ставим finished (статус не показываем, но он нужен для score_match)
      const { error: uErr } = await supabase
        .from("matches")
        .update({
          home_score: parsed.h,
          away_score: parsed.a,
          status: "finished",
        })
        .eq("id", id);

      if (uErr) throw uErr;

      // 2) начисляем очки
      const { error: sErr } = await supabase.rpc("score_match", { p_match_id: id });
      if (sErr) throw sErr;

      setSavedIds((prev) => new Set(prev).add(id));
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setSavingId(null);
    }
  }

  async function saveAll() {
    setMsg(null);
    setBulkSaving(true);

    try {
      // сохраняем все матчи, где введены оба числа
      const idsToSave: number[] = [];
      const invalidIds: number[] = [];

      for (const m of matches) {
        const v = vals[m.id] ?? { h: "", a: "" };
        const parsed = parseScore(v);

        if (parsed === null) continue; // пустые пропускаем
        if (parsed === "invalid") {
          invalidIds.push(m.id);
          continue;
        }
        idsToSave.push(m.id);
      }

      if (invalidIds.length > 0) {
        setMsg(`Исправьте счёт (не число) в матчах: ${invalidIds.join(", ")}`);
        return;
      }

      if (idsToSave.length === 0) {
        setMsg("Нет заполненных результатов для сохранения");
        return;
      }

      // 1) bulk update: по одному (проще и надёжнее, без сложных upsert’ов)
      for (const id of idsToSave) {
        const v = vals[id];
        const parsed = parseScore(v)! as { h: number; a: number };

        const { error: uErr } = await supabase
          .from("matches")
          .update({ home_score: parsed.h, away_score: parsed.a, status: "finished" })
          .eq("id", id);

        if (uErr) throw uErr;

        const { error: sErr } = await supabase.rpc("score_match", { p_match_id: id });
        if (sErr) throw sErr;
      }

      setSavedIds((prev) => {
        const next = new Set(prev);
        idsToSave.forEach((id) => next.add(id));
        return next;
      });

      setMsg("Успешно сохранено ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setBulkSaving(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
      <div
        style={{
          padding: "12px 12px",
          borderBottom: "1px solid #eee",
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          alignItems: "center",
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 900 }}>Ввод результатов</div>

        <button
          type="button"
          onClick={saveAll}
          disabled={bulkSaving}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            minWidth: 240,
          }}
        >
          {bulkSaving ? "..." : "Сохранить результаты всех матчей"}
        </button>
      </div>

      {msg && (
        <div style={{ padding: "10px 12px", color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </div>
      )}

      <div style={{ display: "grid" }}>
        {matches.map((m) => {
          const kickoff = new Date(m.kickoffAt).toLocaleString("ru-RU", {
            dateStyle: "medium",
            timeStyle: "short",
          });

          const v = vals[m.id] ?? { h: "", a: "" };
          const saved = savedIds.has(m.id);

          return (
            <div
              key={m.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 80px 80px 160px",
                gap: 10,
                alignItems: "center",
                padding: "12px 12px",
                borderTop: "1px solid #eee",
              }}
            >
              <div>
                <div style={{ fontWeight: 900 }}>
                  {(m.stageMatchNo ?? "—")}. {m.homeName} — {m.awayName}
                </div>
                <div style={{ marginTop: 4, opacity: 0.75, fontSize: 12 }}>{kickoff}</div>
              </div>

              {/* HOME SCORE */}
              <input
                value={v.h}
                onChange={(e) => setOne(m.id, "h", e.target.value)}
                inputMode="numeric"
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  textAlign: "center", // ✅ центр
                  fontWeight: 900,
                }}
              />

              {/* AWAY SCORE */}
              <input
                value={v.a}
                onChange={(e) => setOne(m.id, "a", e.target.value)}
                inputMode="numeric"
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  textAlign: "center", // ✅ центр
                  fontWeight: 900,
                }}
              />

              <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", alignItems: "center" }}>
                {saved ? (
                  <span style={{ fontWeight: 900, opacity: 0.9 }}>Успешно сохранено</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => saveOne(m.id)}
                    disabled={savingId === m.id || bulkSaving}
                    style={{
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: "1px solid #111",
                      background: "#111",
                      color: "#fff",
                      cursor: "pointer",
                      minWidth: 140,
                    }}
                  >
                    {savingId === m.id ? "..." : "Сохранить"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
