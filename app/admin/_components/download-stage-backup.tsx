"use client";

import { useState } from "react";

export default function DownloadStageBackup(props: { stageId: number }) {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup/stage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId: props.stageId, includeLedger: true }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.message ? `${j.error}: ${j.message}` : (j?.error ?? `Ошибка (${res.status})`));
      }

      const blob = await res.blob();

      // filename из content-disposition
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename = m?.[1] ?? `stage-${props.stageId}-backup.json`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setMsg("Бэкап скачан ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <button
        onClick={run}
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
        {loading ? "Готовим..." : "Скачать бэкап этапа (JSON)"}
      </button>

      {msg ? <span style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</span> : null}
    </div>
  );
}