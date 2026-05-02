"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateTourForm({ stageId }: { stageId: number }) {
  const router = useRouter();

  const [tourNo, setTourNo] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const no = tourNo.trim().toUpperCase();
    if (!no) {
      setMsg("Введите номер или код тура, например: 19, КР, ЛЧ, ЛЕ, ЛК");
      return;
    }

    const tourName = name.trim() || null;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/tours", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: stageId,
          tour_no: no,
          name: tourName,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка создания тура (${res.status})`);
      }

      setTourNo("");
      setName("");
      setMsg("Тур создан ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка создания тура");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Создать тур</div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={tourNo}
          onChange={(e) => setTourNo(e.target.value)}
          placeholder="Номер/код тура: 19, КР, ЛЧ"
          disabled={loading}
          style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd", width: 220 }}
        />

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Название (необязательно)"
          disabled={loading}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            minWidth: 240,
            flex: "1 1 240px",
          }}
        />

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontWeight: 900,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Создание..." : "Создать"}
        </button>
      </div>

      {msg ? (
        <div style={{ marginTop: 10, fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </div>
      ) : null}
    </form>
  );
}