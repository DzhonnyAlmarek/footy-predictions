"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function PublishStage(props: {
  stageId: number;
  stageStatus: string;
  matchCount: number;
  required: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<"publish" | "lock" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function publishStage() {
    setMsg(null);
    setLoading("publish");
    try {
      const res = await fetch("/api/admin/stages/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: props.stageId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка публикации (${res.status})`);
      }

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка публикации этапа");
    } finally {
      setLoading(null);
    }
  }

  async function lockStage() {
    setMsg(null);
    setLoading("lock");
    try {
      const res = await fetch("/api/admin/stages/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId: props.stageId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `Ошибка закрытия (${res.status})`);
      }

      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка закрытия этапа");
    } finally {
      setLoading(null);
    }
  }

  const canPublish = props.stageStatus === "draft";
  const canLock = props.stageStatus === "published";

  return (
    <div
      style={{
        border: "1px solid #e5e5e5",
        borderRadius: 12,
        padding: 14,
        display: "grid",
        gap: 10,
      }}
    >
      <div style={{ fontWeight: 900 }}>Публикация и закрытие этапа</div>

      <div style={{ fontSize: 14, opacity: 0.85 }}>
        Матчей в этапе: <b>{props.matchCount}</b> / {props.required}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={publishStage}
          disabled={!canPublish || !!loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            opacity: !canPublish ? 0.6 : 1,
            cursor: !canPublish || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading === "publish" ? "Публикация..." : "Опубликовать этап"}
        </button>

        <button
          type="button"
          onClick={lockStage}
          disabled={!canLock || !!loading}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid #111",
            background: "#fff",
            opacity: !canLock ? 0.6 : 1,
            cursor: !canLock || loading ? "not-allowed" : "pointer",
          }}
        >
          {loading === "lock" ? "Закрытие..." : "Закрыть этап"}
        </button>
      </div>

      {msg ? <div style={{ color: "crimson", fontWeight: 800 }}>{msg}</div> : null}
    </div>
  );
}