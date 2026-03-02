"use client";

import { useState } from "react";

function fileSafeName(s: string) {
  return String(s)
    .trim()
    .replace(/[^\p{L}\p{N}\-_ .]/gu, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

export default function DownloadStageBackup(props: { stageId: number; stageName?: string | null }) {
  const [loading, setLoading] = useState(false);

  async function run() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/backup/stage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stageId: props.stageId, includeLedger: true }),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j?.message ? `${j.error}: ${j.message}` : (j?.error ?? `Ошибка (${res.status})`));
        return;
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") ?? "";
      const m = /filename="([^"]+)"/.exec(cd);
      const filename =
        m?.[1] ?? fileSafeName(`stage-${props.stageId}-${props.stageName ?? "backup"}.json`);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
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
        opacity: loading ? 0.75 : 1,
      }}
      title="Скачать JSON-бэкап этапа"
    >
      {loading ? "Готовим..." : "Скачать JSON"}
    </button>
  );
}