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

function fmtDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  // компактно: "27 февр., 15:00"
  return d.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ResultsEditor(props: { stageId: number; matches?: MatchRow[] }) {
  const matches = Array.isArray(props.matches) ? props.matches : [];

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
  const [okSaved, setOkSaved] = useState<Record<number, boolean>>({});
  const [errByMatch, setErrByMatch] = useState<Record<number, string | null>>({});

  // пусто, если null (никаких "0" по умолчанию)
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

  function setVal(matchId: number, patch: Partial<{ h: string; a: string }>) {
    setVals((p) => ({
      ...p,
      [matchId]: { ...(p[matchId] ?? { h: "", a: "" }), ...patch },
    }));
    setOkSaved((p) => ({ ...p, [matchId]: false }));
    setErrByMatch((p) => ({ ...p, [matchId]: null }));
  }

  async function save(matchId: number) {
    setErrByMatch((p) => ({ ...p, [matchId]: null }));
    setOkSaved((p) => ({ ...p, [matchId]: false }));

    const v = vals[matchId] ?? { h: "", a: "" };
    const hh = v.h.trim();
    const aa = v.a.trim();

    // разрешаем очистку результата полностью
    const home = hh === "" ? null : Number(hh);
    const away = aa === "" ? null : Number(aa);

    // если одно заполнено, другое пустое — просто подсветим ошибку (без "введите оба числа" глобально)
    if ((home == null) !== (away == null)) {
      setErrByMatch((p) => ({ ...p, [matchId]: "Нужно заполнить оба поля или очистить оба" }));
      return;
    }

    // если заполнено — только целые 0+
    if (home != null) {
      if (!Number.isInteger(home) || home < 0 || !Number.isInteger(away!) || away! < 0) {
        setErrByMatch((p) => ({ ...p, [matchId]: "Только целые 0+" }));
        return;
      }
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
          status: home == null ? null : "finished",
        }),
        cache: "no-store",
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Ошибка сохранения");

      setOkSaved((p) => ({ ...p, [matchId]: true }));
    } catch (e: any) {
      setErrByMatch((p) => ({ ...p, [matchId]: e?.message ?? "Ошибка сохранения" }));
    } finally {
      setSaving(null);
    }
  }

  return (
    <table className="table resultsTable" style={{ minWidth: 780 }}>
      <thead>
        <tr>
          <th style={{ width: 54 }}>№</th>
          <th style={{ width: 140 }}>Дата</th>
          <th>Матч</th>
          <th className="colScore">Счёт</th>
          <th style={{ width: 140 }} />
        </tr>
      </thead>

      <tbody>
        {sorted.map((m, idx) => {
          const no = m.stage_match_no ?? idx + 1;
          const home = teamName(m.home_team);
          const away = teamName(m.away_team);

          const v = vals[m.id] ?? { h: "", a: "" };
          const saved = !!okSaved[m.id];
          const err = errByMatch[m.id] ?? null;

          return (
            <tr key={m.id} className={err ? "rowUrgent" : ""}>
              <td style={{ fontWeight: 900, opacity: 0.9 }}>{no}</td>

              <td style={{ whiteSpace: "nowrap" }}>{fmtDateTime(m.kickoff_at)}</td>

              <td>
                <div style={{ fontWeight: 900 }}>
                  {home} — {away}
                </div>
                {err ? <div className="rowWarn" style={{ color: "rgba(185,28,28,.95)" }}>{err}</div> : null}
              </td>

              <td className="resultCell">
                <div className="resultInputs">
                  <input
                    value={v.h}
                    onChange={(e) => setVal(m.id, { h: e.target.value })}
                    inputMode="numeric"
                    placeholder=""
                    className="resultInput"
                    disabled={saving === m.id}
                  />
                  <span className="resultSep">:</span>
                  <input
                    value={v.a}
                    onChange={(e) => setVal(m.id, { a: e.target.value })}
                    inputMode="numeric"
                    placeholder=""
                    className="resultInput"
                    disabled={saving === m.id}
                  />
                </div>
              </td>

              <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                <button
                  type="button"
                  onClick={() => save(m.id)}
                  disabled={saving === m.id}
                  className={`saveBtn ${saved ? "saveBtnOk" : ""}`}
                >
                  {saving === m.id ? "..." : saved ? "Сохранено" : "Сохранить"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
