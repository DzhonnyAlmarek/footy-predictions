"use client";

import { useState } from "react";

export default function RestoreStageBackup() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>("");

  const [strategy, setStrategy] = useState<"upsert" | "replace">("upsert");
  const [payload, setPayload] = useState<any>(null);

  async function onPick(file: File | null) {
    setMsg(null);
    setPayload(null);
    setFileName(file?.name ?? "");
    if (!file) return;

    try {
      const text = await file.text();
      const json = JSON.parse(text);
      setPayload(json);
      setMsg("Файл загружен ✅ (готово к dry-run)");
    } catch (e: any) {
      setMsg(`Не удалось прочитать JSON: ${e?.message ?? e}`);
    }
  }

  async function run(mode: "dry_run" | "apply") {
    setMsg(null);
    if (!payload) return setMsg("Сначала выбери JSON файл бэкапа");

    if (mode === "apply") {
      const ok = confirm(
        strategy === "replace"
          ? "ВНИМАНИЕ: replace удалит данные этапа и заменит их из бэкапа. Продолжить?"
          : "Восстановить (upsert) данные из бэкапа? Продолжить?"
      );
      if (!ok) return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/restore/stage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, strategy, payload }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.message ? `${json.error}: ${json.message}` : (json?.error ?? `Ошибка (${res.status})`));

      const s = json?.summary;
      const warn = (s?.warnings ?? []).length ? `\n\nПредупреждения:\n- ${(s.warnings as string[]).join("\n- ")}` : "";
      setMsg(
        `${mode === "dry_run" ? "Dry-run ✅" : "Восстановление ✅"}\n` +
          `Этап: #${s?.stage_id}${s?.stage_name ? ` — ${s.stage_name}` : ""}\n` +
          `Teams: ${s?.counts?.teams ?? 0}, Tours: ${s?.counts?.tours ?? 0}, Matches: ${s?.counts?.matches ?? 0}, Predictions: ${s?.counts?.predictions ?? 0}, Ledger: ${s?.counts?.points_ledger ?? 0}` +
          warn
      );
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, padding: 14 }}>
      <div style={{ fontWeight: 900 }}>Восстановление из JSON</div>

      <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          disabled={loading}
        />

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, opacity: 0.8, fontWeight: 800 }}>Стратегия</span>
            <select
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as any)}
              disabled={loading}
              style={{ padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
            >
              <option value="upsert">upsert (добавить/обновить, не удаляя)</option>
              <option value="replace">replace (удалить данные этапа и заменить)</option>
            </select>
          </label>

          <button
            type="button"
            onClick={() => run("dry_run")}
            disabled={loading || !payload}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#fff",
              fontWeight: 900,
            }}
          >
            {loading ? "..." : "Dry-run"}
          </button>

          <button
            type="button"
            onClick={() => run("apply")}
            disabled={loading || !payload}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              opacity: !payload ? 0.6 : 1,
            }}
          >
            {loading ? "..." : "Восстановить"}
          </button>

          <span style={{ fontSize: 12, opacity: 0.75 }}>
            {fileName ? `Файл: ${fileName}` : "Файл не выбран"}
          </span>
        </div>

        <div style={{ fontSize: 12, opacity: 0.75 }}>
          <b>upsert</b> безопаснее. <b>replace</b> — только если точно хочешь «как в бэкапе».
        </div>

        {msg ? (
          <pre style={{ whiteSpace: "pre-wrap", fontWeight: 800, color: msg.includes("✅") ? "inherit" : "crimson" }}>
            {msg}
          </pre>
        ) : null}
      </div>
    </div>
  );
}