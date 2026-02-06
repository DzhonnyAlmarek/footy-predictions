"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyT: any = t as any;
  if (Array.isArray(anyT)) return String(anyT?.[0]?.name ?? "?");
  return String(anyT?.name ?? "?");
}

function sortMatches(a: MatchRow, b: MatchRow) {
  const an = a.stage_match_no ?? 1e9;
  const bn = b.stage_match_no ?? 1e9;
  if (an !== bn) return an - bn;

  const ak = a.kickoff_at ? new Date(a.kickoff_at).getTime() : 0;
  const bk = b.kickoff_at ? new Date(b.kickoff_at).getTime() : 0;
  if (ak !== bk) return ak - bk;

  return a.id - b.id;
}

export default function ResultsEditor(props: {
  stageId: number;
  initialMatches?: MatchRow[];
  matches?: MatchRow[];
}) {
  const router = useRouter();

  const matchesInput: MatchRow[] = Array.isArray(props.matches)
    ? props.matches
    : Array.isArray(props.initialMatches)
    ? props.initialMatches
    : [];

  const matches = [...matchesInput].sort(sortMatches);

  const supabase = useMemo(() => createClient(), []);

  const [savingId, setSavingId] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [savedOk, setSavedOk] = useState<Record<number, boolean>>({});

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
    setSavedOk((p) => ({ ...p, [matchId]: false }));

    const v = vals[matchId] ?? { h: "", a: "" };
    const h = v.h.trim();
    const a = v.a.trim();

    const home = h === "" ? null : Number(h);
    const away = a === "" ? null : Number(a);

    if (home !== null && (!Number.isFinite(home) || home < 0)) return setMsg("Некорректный счёт хозяев");
    if (away !== null && (!Number.isFinite(away) || away < 0)) return setMsg("Некорректный счёт гостей");

    setSavingId(matchId);

    try {
      const { error } = await supabase
        .from("matches")
        .update({ home_score: home, away_score: away })
        .eq("id", matchId);

      if (error) throw error;

      setSavedOk((p) => ({ ...p, [matchId]: true }));
      setMsg("Сохранено ✅");

      // важно: чтобы на серверных страницах/таблицах точно обновилось
      router.refresh();
    } catch (e: any) {
      setMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e5e5", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ padding: 12, background: "#fafafa", fontWeight: 900 }}>
        Матчи этапа: {matches.length}
      </div>

      {msg ? (
        <div style={{ padding: 12, color: msg.includes("✅") ? "inherit" : "crimson", fontWeight: 800 }}>
          {msg}
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 10, padding: 12 }}>
        {matches.map((m) => {
          const home = teamName(m.home_team);
          const away = teamName(m.away_team);
          const v = vals[m.id] ?? { h: "", a: "" };
          const ok = !!savedOk[m.id];

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
                  disabled={savingId === m.id}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid " + (ok ? "rgba(34,197,94,0.9)" : "#111"),
                    background: ok ? "rgba(34,197,94,0.12)" : "#111",
                    color: ok ? "rgba(21,128,61,1)" : "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                    minWidth: 190,
                  }}
                >
                  {savingId === m.id ? "..." : ok ? "Сохранено успешно" : "Сохранить"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
