"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

export default function StageRowActions(props: {
  stageId: number;
  initialName: string;
  initialMatchesRequired: number;
}) {
  const router = useRouter();

  const [name, setName] = useState(props.initialName ?? "");
  const [matchesRequired, setMatchesRequired] = useState<string>(String(props.initialMatchesRequired ?? 56));

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const dirty = useMemo(() => {
    return (
      name.trim() !== String(props.initialName ?? "").trim() ||
      Number(matchesRequired) !== Number(props.initialMatchesRequired)
    );
  }, [name, matchesRequired, props.initialName, props.initialMatchesRequired]);

  async function save() {
    setMsg(null);

    const newName = name.trim();
    if (!newName) return setMsg("Название не может быть пустым");

    const mr = Number(matchesRequired);
    if (!Number.isFinite(mr) || mr <= 0) return setMsg("Матчей в этапе должно быть числом > 0");

    setLoading(true);
    try {
      const res = await fetch("/api/admin/stages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage_id: props.stageId,
          name: newName,
          matches_required: mr,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Ошибка сохранения (${res.status})`);

      setMsg("Сохранено ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  }

  async function remove() {
    setMsg(null);
    if (!confirm("Удалить этап? Это удалит туры и матчи этапа.")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/admin/stages", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: props.stageId }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error ?? `Ошибка удаления (${res.status})`);

      setMsg("Этап удалён ✅");
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка удаления");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minWidth: 320 }}>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Название</div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </div>

        <div>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>Матчей в этапе</div>
          <input
            value={matchesRequired}
            onChange={(e) => setMatchesRequired(e.target.value)}
            inputMode="numeric"
            disabled={loading}
            style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
          />
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={save}
            disabled={loading || !dirty}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: loading || !dirty ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "..." : "Сохранить"}
          </button>

          <button
            type="button"
            onClick={remove}
            disabled={loading}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              fontWeight: 900,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "..." : "Удалить этап"}
          </button>
        </div>

        {msg ? (
          <div style={{ fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>{msg}</div>
        ) : null}
      </div>
    </div>
  );
}
