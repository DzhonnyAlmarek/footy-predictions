"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateTourForm(props: {
  stageId: number;
  stageStatus: string; // draft | published | locked
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const locked = props.stageStatus === "locked";

  const [tourNo, setTourNo] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function create() {
    setMsg(null);
    if (locked) return setMsg("Этап закрыт — добавлять туры нельзя");

    const no = Number(tourNo);
    if (!Number.isInteger(no) || no < 1) return setMsg("Номер тура должен быть целым >= 1");

    setLoading(true);
    try {
      const { error } = await supabase.from("tours").insert({
        stage_id: props.stageId,
        tour_no: no,
        name: name.trim() ? name.trim() : null,
      });

      if (error) throw error;

      setTourNo("");
      setName("");
      router.refresh();
      setMsg("Создано ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Новый тур</div>

      {locked && (
        <div style={{ marginTop: 8, color: "crimson" }}>
          Этап закрыт (locked) — добавление туров запрещено.
        </div>
      )}

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={tourNo}
          onChange={(e) => setTourNo(e.target.value)}
          placeholder="Номер тура"
          disabled={loading || locked}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 140 }}
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название (необязательно)"
          disabled={loading || locked}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", minWidth: 260 }}
        />
        <button
          type="button"
          onClick={create}
          disabled={loading || locked}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            opacity: locked ? 0.6 : 1,
          }}
        >
          {loading ? "..." : "Создать"}
        </button>
      </div>

      {msg && <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>}
    </div>
  );
}
