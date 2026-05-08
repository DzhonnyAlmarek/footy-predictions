"use client";

import { useState } from "react";

type Round = {
  id: number;
  name: string;
  source_type: string;
  stage_id: number | null;
};

type SiteStage = {
  id: number;
  name: string;
  status: string | null;
  is_current: boolean | null;
};

export default function GrandPrixSourceForm({
  round,
  siteStages,
  seasonSlug,
}: {
  round: Round;
  siteStages: SiteStage[];
  seasonSlug: string;
}) {
  const [sourceType, setSourceType] = useState(round.source_type);

  const isStage = sourceType === "stage";

  return (
    <form
      action="/api/admin/grand-prix"
      method="post"
      style={{
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap",
        padding: 12,
        border: "1px solid #e5e7eb",
        borderRadius: 12,
      }}
    >
      <input type="hidden" name="action" value="updateRoundSource" />
      <input type="hidden" name="seasonSlug" value={seasonSlug} />
      <input type="hidden" name="roundId" value={round.id} />

      <b style={{ minWidth: 80 }}>{round.name}</b>

      <select
        name="sourceType"
        value={sourceType}
        onChange={(e) => setSourceType(e.target.value)}
        style={{
          padding: 8,
          borderRadius: 8,
          border: "1px solid #cbd5e1",
          background: "#fff",
          color: "#111827",
        }}
      >
        <option value="manual">Ручной ввод</option>
        <option value="stage">Этап сайта</option>
      </select>

      {isStage ? (
        <select
          name="stageId"
          defaultValue={round.stage_id ?? ""}
          required
          style={{
            minWidth: 220,
            padding: 8,
            borderRadius: 8,
            border: "1px solid #cbd5e1",
            background: "#fff",
            color: "#111827",
          }}
        >
          <option value="">— выбрать этап сайта —</option>

          {siteStages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} / {s.status}
              {s.is_current ? " / текущий" : ""}
            </option>
          ))}
        </select>
      ) : null}

      <button type="submit" className="pill">
        Сохранить источник
      </button>
    </form>
  );
}