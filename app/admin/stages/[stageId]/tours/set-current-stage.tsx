"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetCurrentStageButton(props: {
  stageId: number;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function setCurrent() {
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/stages/set-current", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: props.stageId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка установки текущего этапа (${res.status})`);
      }

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка установки текущего этапа");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <button
        type="button"
        onClick={setCurrent}
        disabled={loading || props.isCurrent}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #111",
          background: props.isCurrent ? "#f3f4f6" : "#111",
          color: props.isCurrent ? "#111" : "#fff",
          opacity: props.isCurrent ? 0.8 : 1,
          cursor: loading || props.isCurrent ? "not-allowed" : "pointer",
          fontWeight: 900,
        }}
      >
        {props.isCurrent
          ? "Текущий этап"
          : loading
          ? "Установка..."
          : "Сделать текущим"}
      </button>

      {msg ? <div style={{ color: "crimson", fontWeight: 800 }}>{msg}</div> : null}
    </div>
  );
}