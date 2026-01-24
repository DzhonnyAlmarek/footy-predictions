"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function StageActions(props: {
  stageId: number;
  initialName: string;
  initialStatus: string; // draft | published | locked
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [name, setName] = useState(props.initialName);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const deleteBlocked = props.initialStatus === "locked";

  async function rename() {
    setMsg(null);
    const trimmed = name.trim();
    if (!trimmed) return setMsg("Название не может быть пустым");

    setLoading(true);
    try {
      const { error } = await supabase
        .from("stages")
        .update({ name: trimmed })
        .eq("id", props.stageId);

      if (error) throw error;

      router.refresh();
      setMsg("Сохранено ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    setMsg(null);

    if (deleteBlocked) {
      setMsg("Этап закрыт (locked) — удаление запрещено");
      return;
    }

    const ok = confirm(
      "Удалить этап?\nБудут удалены: все туры и все матчи этапа.\nДействие необратимо."
    );
    if (!ok) return;

    setLoading(true);
    try {
      // Сначала удаляем матчи этапа (FK stage_id RESTRICT)
      const { error: mErr } = await supabase
        .from("matches")
        .delete()
        .eq("stage_id", props.stageId);

      if (mErr) throw mErr;

      // Потом удаляем этап (tours удалятся каскадом)
      const { error } = await supabase
        .from("stages")
        .delete()
        .eq("id", props.stageId);

      if (error) throw error;

      router.push("/admin/stages");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Этап: действия</div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={loading}
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", minWidth: 320 }}
        />

        <button
          onClick={rename}
          disabled={loading}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          {loading ? "..." : "Переименовать"}
        </button>

        <button
          onClick={remove}
          disabled={loading || deleteBlocked}
          title={deleteBlocked ? "Этап locked — удаление запрещено" : "Удалить этап"}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: deleteBlocked ? "#777" : "#fff",
            cursor: deleteBlocked ? "not-allowed" : "pointer",
          }}
        >
          Удалить этап
        </button>
      </div>

      {deleteBlocked && (
        <div style={{ marginTop: 8, opacity: 0.8 }}>
          Удаление заблокировано: этап в статусе <b>locked</b>.
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </div>
      )}
    </div>
  );
}
