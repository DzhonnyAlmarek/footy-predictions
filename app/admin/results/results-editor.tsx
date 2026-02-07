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

function fmtKickoff(kickoff?: string | null) {
  if (!kickoff) return "—";
  const d = new Date(kickoff);
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
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
          status: "finished",
        }),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Ошибка сохранения");

      setOkSaved((p) => ({ ...p, [matchId]: true }));
      setGlobalMsg("Сохранено ✅ (очки пересчитаны)");
    } catch (e: any) {
      setGlobalMsg(e?.message ?? "Ошибка сохранения");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="resultsWrap">
      <div className="resultsTop">
        <div className="resultsTitle">
          Матчи: <b>{sorted.length}</b>
        </div>

        {globalMsg ? (
          <div className={`resultsMsg ${globalMsg.includes("✅") ? "ok" : "bad"}`}>
            {globalMsg}
          </div>
        ) : null}
      </div>

      <div className="resultsList">
        {sorted.map((m) => {
          const home = teamName(m.home_team);
          const away = teamName(m.away_team);
          const v = vals[m.id] ?? { h: "", a: "" };
          const saved = !!okSaved[m.id];

          return (
            <div key={m.id} className="matchCard">
              <div className="matchHead">
                <div className="matchTitle">
                  <span className="matchNo">{m.stage_match_no ?? "—"}.</span> {home} — {away}
                </div>
                <div className="matchMeta">{fmtKickoff(m.kickoff_at)}</div>
              </div>

              <div className="matchControls">
                <div className="scoreInputs">
                  <input
                    className="scoreInput"
                    value={v.h}
                    onChange={(e) =>
                      setVals((p) => ({
                        ...p,
                        [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), h: e.target.value },
                      }))
                    }
                    inputMode="numeric"
                    placeholder="0"
                  />
                  <span className="scoreSep">:</span>
                  <input
                    className="scoreInput"
                    value={v.a}
                    onChange={(e) =>
                      setVals((p) => ({
                        ...p,
                        [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), a: e.target.value },
                      }))
                    }
                    inputMode="numeric"
                    placeholder="0"
                  />
                </div>

                <button
                  type="button"
                  className={`btn ${saved ? "btnOk" : "btnDark"}`}
                  onClick={() => save(m.id)}
                  disabled={saving === m.id}
                >
                  {saving === m.id ? "…" : saved ? "Сохранено" : "Сохранить"}
                </button>

                <div className="matchHint">
                  Просто меняй счёт и жми <b>Сохранить</b>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
