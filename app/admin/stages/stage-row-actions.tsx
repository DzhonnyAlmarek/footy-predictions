"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function StageRowActions(props: {
  stageId: number;
  initialName: string;
  initialStatus: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.initialName);
  const [status, setStatus] = useState(props.initialStatus);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setMsg(null);
    const trimmed = name.trim();
    if (!trimmed) return setMsg("Название не может быть пустым");

    setLoading(true);
    try {
      const { error } = await supabase
        .from("stages")
        .update({ name: trimmed, status })
        .eq("id", props.stageId);

      if (error) throw error;

      setEditing(false);
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    setMsg(null);
    if (!confirm("Удалить этап? Будут удалены туры и матчи этапа.")) return;

    setLoading(true);
    try {
      // ВАЖНО: у stages -> tours CASCADE, но matches stage_id RESTRICT.
      // Поэтому сначала удаляем матчи этапа, потом этап.
      const { error: mErr } = await supabase.from("matches").delete().eq("stage_id", props.stageId);
      if (mErr) throw mErr;

      const { error } = await supabase.from("stages").delete().eq("id", props.stageId);
      if (error) throw error;

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minWidth: 320 }}>
      {editing ? (
        <div style={{ display: "grid", gap: 8 }}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          >
            <option value="draft">draft</option>
            <option value="published">published</option>
            <option value="locked">locked</option>
          </select>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={save}
              disabled={loading}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff" }}
            >
              {loading ? "..." : "Сохранить"}
            </button>
            <button
              onClick={() => { setEditing(false); setName(props.initialName); setStatus(props.initialStatus); }}
              disabled={loading}
              style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#fff" }}
            >
              Отмена
            </button>
          </div>

          {msg && <div style={{ color: "crimson" }}>{msg}</div>}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={() => setEditing(true)}
            disabled={loading}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#fff" }}
          >
            Редактировать
          </button>
          <button
            onClick={remove}
            disabled={loading}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#fff" }}
          >
            Удалить
          </button>
          {msg && <div style={{ color: "crimson" }}>{msg}</div>}
        </div>
      )}
    </div>
  );
}
