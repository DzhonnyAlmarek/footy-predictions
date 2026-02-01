"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CreateStageForm() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);

    const stageName = name.trim();
    if (!stageName) {
      setMsg("Введите название этапа");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: stageName }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? `Ошибка создания (${res.status})`);
      }

      setName("");
      setMsg("Этап создан ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка создания");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 14,
      }}
    >
      <div style={{ fontWeight: 900 }}>Новый этап</div>

      <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder='Название (например: "РПЛ 2025/26")'
          disabled={loading}
          style={{
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ddd",
            minWidth: 260,
            flex: "1 1 260px",
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

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
        Создание выполняется на сервере через admin API (service role), поэтому RLS не блокирует.
      </div>
    </form>
  );
}
