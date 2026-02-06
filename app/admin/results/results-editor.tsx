"use client";

import { useMemo, useState } from "react";

type TeamObj = { name: string } | { name: string }[] | null;

type MatchRow = {
  id: number;
  stage_match_no?: number | null;
  kickoff_at?: string | null;
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;
  home_team?: TeamObj;
  away_team?: TeamObj;
};

function teamName(t?: TeamObj) {
  if (!t) return "?";
  const anyT: any = t as any;
  if (Array.isArray(anyT)) return String(anyT?.[0]?.name ?? "?");
  return String(anyT?.name ?? "?");
}

export default function ResultsEditor(props: {
  stageId: number;
  initialMatches?: MatchRow[];
  matches?: MatchRow[];
}) {
  const matches: MatchRow[] = Array.isArray(props.matches)
    ? props.matches
    : Array.isArray(props.initialMatches)
    ? props.initialMatches
    : [];

  // ✅ на всякий случай отсортируем и на клиенте
  const sorted = useMemo(() => {
    return [...matches].sort((a, b) => {
      const an = a.stage_match_no ?? 1e9;
      const bn = b.stage_match_no ?? 1e9;
      if (an !== bn) return an - bn;
      const ad = a.kickoff_at ? new Date(a.kickoff_at).getTime() : 0;
      const bd = b.kickoff_at ? new Date(b.kickoff_at).getTime() : 0;
      return ad - bd;
    });
  }, [matches]);

  const [saving, setSaving] = useState<number | null>(null);
  const [globalMsg, setGlobalMsg] = useState<string | null>(null);

  const [vals, setVals] = useState<Record<number, { h: string; a: string }>>(() => {
    const init: Record<number, { h: string; a: string }> = {};
    for (const m of sorted) {
      init[m.id] = {
        h: m.home_score == null ? "" : String(m.home_score),
        a: m.away_score == null ? "" : String(m.away_score),
      };
    }
    return init;
  });

  // ✅ статус кнопки “Сохранено успешно” по матчам
  const [okSaved, setOkSaved] = useState<Record<number, boolean>>({});

  async function save(matchId: number) {
    setGlobalMsg(null);
    setOkSaved((p) => ({ ...p, [matchId]: false }));

    const v = vals[matchId] ?? { h: "", a: "" };
    const h = v.h.trim();
    const a = v.a.trim();

    const home = h === "" ? null : Number(h);
    const away = a === "" ? null : Number(a);

    if (home !== null && (!Number.isFinite(home) || home < 0)) return setGlobalMsg("Некорректный счёт хозяев");
    if (away !== null && (!Number.isFinite(away) || away < 0)) return setGlobalMsg("Некорректный счёт гостей");

    setSaving(matchId);
    try {
      const res = await fetch("/api/admin/matches", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: matchId,
          home_score: home,
          away_score: away,
          status: "finished", // можно убрать/изменить если не хочешь трогать status
        }),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? "Ошибка сохранения");
      }

      setOkSaved((p) => ({ ...p, [matchId]: true }));
      setGlobalMsg("Сохранено ✅");
    } catch (e: any) {
      setGlobalMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: 12, background: "#fafafa", fontWeight: 900 }}>
        Матчи: {sorted.length}
      </div>

      {globalMsg ? (
        <div style={{ padding: 12, color: globalMsg.includes("✅") ? "inherit" : "crimson", fontWeight: 800 }}>
          {globalMsg}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10, padding: 12 }}>
        {sorted.map((m) => {
          const home = teamName(m.home_team);
          const away = teamName(m.away_team);
          const v = vals[m.id] ?? { h: "", a: "" };
          const saved = !!okSaved[m.id];

          return (
            <div key={m.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div style={{ fontWeight: 900 }}>
                {m.stage_match_no ? <span style={{ opacity: 0.8 }}>{m.stage_match_no}. </span> : null}
                {home} — {away}
              </div>

              <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <input
                  value={v.h}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), h: e.target.value },
                    }))
                  }
                  placeholder="х"
                  style={{ width: 70, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />
                <span style={{ fontWeight: 900 }}>:</span>
                <input
                  value={v.a}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), a: e.target.value },
                    }))
                  }
                  placeholder="г"
                  style={{ width: 70, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                />

                <button
                  type="button"
                  onClick={() => save(m.id)}
                  disabled={saving === m.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid",
                    borderColor: saved ? "rgba(16,185,129,0.7)" : "#111",
                    background: saved ? "rgba(16,185,129,0.15)" : "#111",
                    color: saved ? "#065f46" : "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {saving === m.id ? "..." : saved ? "Сохранено успешно" : "Сохранить"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
