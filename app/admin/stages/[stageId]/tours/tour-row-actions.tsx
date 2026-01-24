"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TourRowActions(props: {
  tourId: number;
  stageStatus: string;
  initialNo: number;
  initialName: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const disabled = props.stageStatus !== "draft";

  const [editing, setEditing] = useState(false);
  const [tourNo, setTourNo] = useState(String(props.initialNo));
  const [name, setName] = useState(props.initialName ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save() {
    setMsg(null);
    const no = Number(tourNo);
    if (!Number.isInteger(no) || no < 1) return setMsg("Номер тура >= 1");

    setLoading(true);
    try {
      const { error } = await supabase
        .from("tours")
        .update({ tour_no: no, name: name.trim() ? name.trim() : null })
        .eq("id", props.tourId);

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
    if (disabled) return setMsg("Этап не draft — удаление запрещено");
    if (!confirm("Удалить тур? Сначала будут удалены матчи тура.")) return;

    setLoading(true);
    try {
      const { error: mErr } = await supabase.from("matches").delete().eq("tour_id", props.tourId);
      if (mErr) throw mErr;

      const { error } = await supabase.from("tours").delete().eq("id", props.tourId);
      if (error) throw error;

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  if (editing) {
    return (
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <input
            value={tourNo}
            onChange={(e) => setTourNo(e.target.value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 120 }}
          />
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 220 }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={save}
            disabled={loading || disabled}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff" }}
          >
            {loading ? "..." : "Сохранить"}
          </button>
          <button
            onClick={() => { setEditing(false); setTourNo(String(props.initialNo)); setName(props.initialName ?? ""); }}
            disabled={loading}
            style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#fff" }}
          >
            Отмена
          </button>
        </div>

        {msg && <div style={{ color: "crimson" }}>{msg}</div>}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
      <button
        onClick={() => setEditing(true)}
        disabled={disabled}
        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#fff" }}
      >
        Редактировать
      </button>
      <button
        onClick={remove}
        disabled={disabled || loading}
        style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#fff" }}
      >
        Удалить
      </button>
      {msg && <div style={{ color: "crimson" }}>{msg}</div>}
    </div>
  );
}
