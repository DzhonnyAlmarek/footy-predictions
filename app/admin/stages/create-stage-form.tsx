"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function CreateStageForm() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [name, setName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create() {
    setMsg(null);
    const trimmed = name.trim();
    if (!trimmed) return setMsg("Введите название этапа");

    setLoading(true);
    try {
      const { error } = await supabase.from("stages").insert({
        name: trimmed,
        status: "draft",
        matches_required: 56,
      });

      if (error) throw error;

      setName("");
      setMsg("Этап создан ✅");
      router.refresh(); // ✅ сразу обновит список на странице
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 800 }}>Новый этап</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Например: Групповой этап"
          style={{ padding: 12, borderRadius: 12, border: "1px solid #ddd", minWidth: 280 }}
        />
        <button
          onClick={create}
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
          {loading ? "..." : "Создать"}
        </button>
      </div>

      {msg && <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>}
    </div>
  );
}
