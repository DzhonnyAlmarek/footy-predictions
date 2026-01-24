"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateTourForm({
  stageId,
  stageStatus,
}: {
  stageId: number;
  stageStatus: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [tourNo, setTourNo] = useState<string>("1");
  const [name, setName] = useState<string>("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const disabled = stageStatus !== "draft";

  async function create() {
    setMsg(null);

    const no = Number(tourNo);
    if (!Number.isInteger(no) || no < 1) return setMsg("Номер тура должен быть целым >= 1");

    setLoading(true);
    try {
      const { error } = await supabase.from("tours").insert({
        stage_id: stageId,
        tour_no: no,
        name: name.trim() ? name.trim() : null,
      });

      if (error) throw error;

      setMsg("Тур создан ✅");
      router.refresh(); // ✅ сразу обновит список туров и счётчики
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800 }}>Новый тур</div>

      {disabled && (
        <div style={{ marginTop: 8, color: "crimson" }}>
          Этап не в draft — добавлять туры нельзя.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={tourNo}
          onChange={(e) => setTourNo(e.target.value)}
          inputMode="numeric"
          placeholder="№ тура"
          disabled={disabled}
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", width: 120 }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название (необязательно)"
          disabled={disabled}
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", minWidth: 260 }}
        />
        <button
          onClick={create}
          disabled={disabled || loading}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: disabled ? "#777" : "#111",
            color: "#fff",
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "..." : "Создать тур"}
        </button>
      </div>

      {msg && <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>}
    </div>
  );
}
