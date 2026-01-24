"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SetCurrentStageButton({
  stageId,
  isCurrent,
}: {
  stageId: number;
  isCurrent: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function makeCurrent() {
    setMsg(null);
    setLoading(true);
    try {
      const { error } = await supabase.rpc("set_current_stage", { p_stage_id: stageId });
      if (error) throw error;
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
          cursor: isCurrent ? "default" : "pointer",
        }}
        title={isCurrent ? "Этот этап уже текущий" : "Сделать этап текущим"}
      >
        {isCurrent ? "Текущий этап" : loading ? "..." : "Сделать текущим"}
      </button>
      {msg && <span style={{ color: "crimson" }}>{msg}</span>}
    </div>
  );
}
