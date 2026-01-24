"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function PublishStage(props: {
  stageId: number;
  stageStatus: string;
  matchCount: number;
  required: number;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState<"publish" | "lock" | null>(null);

  const diff = props.required - props.matchCount;

  async function publish() {
    setMsg(null);
    setLoading("publish");
    try {
      const { error } = await supabase.rpc("publish_stage", { p_stage_id: props.stageId });
      if (error) throw error;

      setMsg("Этап опубликован ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка публикации");
    } finally {
      setLoading(null);
    }
  }

  async function lock() {
    setMsg(null);
    setLoading("lock");
    try {
      const { error } = await supabase.rpc("lock_stage", { p_stage_id: props.stageId });
      if (error) throw error;

      setMsg("Этап закрыт ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка закрытия");
    } finally {
      setLoading(null);
    }
  }

  const canPublish = props.stageStatus !== "locked";
  const canLock = props.stageStatus !== "locked" && diff === 0;

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Статус этапа</div>

      <div style={{ marginTop: 8, opacity: 0.85 }}>
        Матчей: <b>{props.matchCount}</b> / {props.required} • статус: <b>{props.stageStatus}</b>
      </div>

      {diff === 0 ? (
        <div style={{ marginTop: 8 }}>Матчей ровно {props.required} — можно закрывать этап.</div>
      ) : diff > 0 ? (
        <div style={{ marginTop: 8, color: "#b58900", fontWeight: 800 }}>
          До закрытия не хватает матчей: {diff}
        </div>
      ) : (
        <div style={{ marginTop: 8, color: "crimson", fontWeight: 900 }}>
          Лишних матчей: {Math.abs(diff)}
        </div>
      )}

      <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button
          onClick={publish}
          disabled={!canPublish || loading !== null}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: !canPublish ? "#777" : "#111",
            color: "#fff",
            cursor: !canPublish ? "not-allowed" : "pointer",
            width: 220,
          }}
          title="Публикация НЕ требует 56 матчей"
        >
          {loading === "publish" ? "..." : "Опубликовать этап"}
        </button>

        <button
          onClick={lock}
          disabled={!canLock || loading !== null}
          style={{
            padding: "12px 14px",
            borderRadius: 12,
            border: "1px solid #111",
            background: !canLock ? "#777" : "#fff",
            cursor: !canLock ? "not-allowed" : "pointer",
            width: 220,
          }}
          title="Закрыть можно только при 56 матчах и номерах 1..56"
        >
          {loading === "lock" ? "..." : "Закрыть этап"}
        </button>
      </div>

      {msg && (
        <div style={{ marginTop: 10, color: msg.includes("✅") ? "inherit" : "crimson" }}>
          {msg}
        </div>
      )}
    </div>
  );
}
