"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type TeamObj = { name: string } | { name: string }[] | null;

type MatchRow = {
  id: number;
  stage_match_no?: number | null;
  kickoff_at?: string | null;
  deadline_at?: string | null;
  status?: string | null;
  home_score?: number | null;
  away_score?: number | null;

  // join aliases
  home_team?: TeamObj; // ✅ может быть undefined
  away_team?: TeamObj; // ✅ может быть undefined
};

function teamName(t?: TeamObj) {
  if (!t) return "?";
  // иногда supabase типизирует как массив
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  const supabase = useMemo(() => createClient(), []);

  const [saving, setSaving] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [vals, setVals] = useState<Record<number, { h: string; a: string }>>(() => {
    const init: Record<number, { h: string; a: string }> = {};
    for (const m of matches) {
      init[m.id] = {
        h: m.home_score == null ? "" : String(m.home_score),
        a: m.away_score == null ? "" : String(m.away_score),
      };
    }
    return init;
  });

  async function save(matchId: number) {
    setMsg(null);

    const v = vals[matchId] ?? { h: "", a: "" };
    const h = v.h.trim();
    const a = v.a.trim();

    const home = h === "" ? null : Number(h);
    const away = a === "" ? null : Number(a);

    if (home !== null && (!Number.isFinite(home) || home < 0)) return setMsg("Некорректный счёт хозяев");
    if (away !== null && (!Number.isFinite(away) || away < 0)) return setMsg("Некорректный счёт гостей");

    setSaving(matchId);
    try {
      const { error } = await supabase
        .from("matches")
        .update({
          home_score: home,
          away_score: away,
        })
        .eq("id", matchId);

      if (error) throw error;
      setMsg("Сохранено ✅");
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: 12, background: "#fafafa", fontWeight: 900 }}>Матчи: {matches.length}</div>

      {msg ? (
        <div style={{ padding: 12, color: msg.includes("✅") ? "inherit" : "crimson", fontWeight: 800 }}>{msg}</div>
      ) : null}

      <div style={{ display: "grid", gap: 10, padding: 12 }}>
        {matches.map((m) => {
          const home = teamName(m.home_team);
          const away = teamName(m.away_team);
          const v = vals[m.id] ?? { h: "", a: "" };

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
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  {saving === m.id ? "..." : "Сохранить"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
