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

function fmtDateTimeRU(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const date = d.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `${date}, ${time}`;
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
  const [globalMsg, setGlobalMsg] = useState<{ text: string; ok: boolean } | null>(null);

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
    const hh = v.h.trim();
    const aa = v.a.trim();

    const home = hh === "" ? null : Number(hh);
    const away = aa === "" ? null : Number(aa);

    if (home !== null && (!Number.isFinite(home) || home < 0 || !Number.isInteger(home))) {
      setGlobalMsg({ text: "Некорректный счёт хозяев (целое число 0+ или пусто)", ok: false });
      return;
    }
    if (away !== null && (!Number.isFinite(away) || away < 0 || !Number.isInteger(away))) {
      setGlobalMsg({ text: "Некорректный счёт гостей (целое число 0+ или пусто)", ok: false });
      return;
    }

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
      setGlobalMsg({ text: "Сохранено ✅ Очки пересчитаны.", ok: true });
    } catch (e: any) {
      setGlobalMsg({ text: e?.message ?? "Ошибка сохранения", ok: false });
    } finally {
      setSaving(null);
    }
  }

  return (
    <div>
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 950 }}>
          Матчи: <span style={{ opacity: 0.75 }}>{sorted.length}</span>
        </div>
        <div style={{ marginTop: 6, color: "rgba(17,24,39,.65)", fontWeight: 800, fontSize: 12 }}>
          Сохранение пересчитает очки автоматически
        </div>

        {globalMsg ? (
          <div
            className={`globalMsg ${globalMsg.ok ? "globalMsgOk" : "globalMsgBad"}`}
            style={{ marginTop: 10 }}
          >
            {globalMsg.text}
          </div>
        ) : null}
      </div>

      <div className="resultsWrap">
        {sorted.map((m, idx) => {
          const no = m.stage_match_no ?? idx + 1;
          const home = teamName(m.home_team);
          const away = teamName(m.away_team);

          const v = vals[m.id] ?? { h: "", a: "" };
          const saved = !!okSaved[m.id];

          return (
            <div key={m.id} className="matchCard">
              <div className="matchTop">
                <div className="matchTitle">
                  <span style={{ opacity: 0.7, fontWeight: 900, marginRight: 8 }}>{no}.</span>
                  {home} — {away}
                </div>
                <div className="matchMeta">{fmtDateTimeRU(m.kickoff_at)}</div>
              </div>

              <div className="scoreRow" aria-label="Ввод результата">
                <input
                  className="scoreInput"
                  value={v.h}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), h: e.target.value },
                    }))
                  }
                  placeholder="х"
                  inputMode="numeric"
                />
                <span style={{ fontWeight: 950, opacity: 0.7 }}>:</span>
                <input
                  className="scoreInput"
                  value={v.a}
                  onChange={(e) =>
                    setVals((p) => ({
                      ...p,
                      [m.id]: { ...(p[m.id] ?? { h: "", a: "" }), a: e.target.value },
                    }))
                  }
                  placeholder="г"
                  inputMode="numeric"
                />

                <button
                  type="button"
                  className={`saveBtn ${saved ? "saveOk" : ""}`}
                  onClick={() => save(m.id)}
                  disabled={saving === m.id}
                >
                  {saving === m.id ? "..." : saved ? "Сохранено" : "Сохранить"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
