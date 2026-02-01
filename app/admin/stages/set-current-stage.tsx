"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SetCurrentStageButton({
  stageId,
  isCurrent,
}: {
  stageId: number;
  isCurrent: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function makeCurrent() {
    setMsg(null);
    setLoading(true);

    try {
      const res = await fetch("/api/admin/stages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId, set_current: true }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        // покажем понятную ошибку
        throw new Error(json?.error ?? `Ошибка (${res.status})`);
      }

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button
        type="button"
        onClick={makeCurrent}
        disabled={loading || isCurrent}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border: "1px solid #111",
          background: isCurrent ? "#111" : "#fff",
          color: isCurrent ? "#fff" : "#111",
          cursor: isCurrent ? "default" : loading ? "not-allowed" : "pointer",
          fontWeight: 900,
        }}
        title={isCurrent ? "Этот этап уже текущий" : "Сделать этап текущим"}
      >
        {isCurrent ? "Текущий этап" : loading ? "..." : "Сделать текущим"}
      </button>

      {msg ? <span style={{ color: "crimson", fontWeight: 800 }}>{msg}</span> : null}
    </div>
  );
}
