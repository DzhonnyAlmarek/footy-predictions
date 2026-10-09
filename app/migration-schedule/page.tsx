"use client";

import { useEffect, useMemo, useState } from "react";

type Stage = { id: number; name: string; status: string | null; is_current: boolean | null };
type Tour = { id: number; stage_id: number; tour_no: number | null; name: string | null };
type Match = {
  id: number; stage_id: number | null; tour_id: number | null;
  kickoff_at: string | null; deadline_at: string | null; status: string | null;
  home_team: string | null; away_team: string | null;
  home_score: number | null; away_score: number | null;
};
type Data = { ok: boolean; stages: Stage[]; tours: Tour[]; matches: Match[];
  counts: { stages: number; tours: number; matches: number } };
function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit"
  }) + " МСК" : "не назначено";
}

export default function MigrationSchedulePage() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [stageId, setStageId] = useState("all");
  useEffect(() => {
    const ctrl = new AbortController();
    fetch("/api/test/migration-schedule", { cache: "no-store", signal: ctrl.signal })
      .then(async r => { if (!r.ok) throw new Error("unavailable"); return r.json(); })
      .then((v: Data) => {
        if (v.ok && Array.isArray(v.stages) && Array.isArray(v.tours) && Array.isArray(v.matches))
          setData(v);
        else setError("Некорректный ответ Neon");
      })
      .catch(() => { if (!ctrl.signal.aborted) setError("Не удалось загрузить расписание из Neon"); });
    return () => ctrl.abort();
  }, []);
  const filtered = useMemo(() => {
    if (!data) return [];
    return stageId === "all" ? data.matches : data.matches.filter(m => String(m.stage_id) === stageId);
  }, [data, stageId]);
  const tourName = (id: number | null) =>
    data?.tours.find(t => String(t.id) === String(id))?.name || (id == null ? "Без тура" : "Тур " + id);
  return <main style={{ maxWidth: 960, margin: "32px auto", padding: 20, fontFamily: "sans-serif" }}>
    <h1>История Footy — Neon (локальная проверка)</h1>
    <p>Перенесённые матчи и расписание. Только чтение; прогнозы и участники не показываются.</p>
    {!data && !error && <p role="status">Загрузка…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <p>Этапов: {data.counts.stages} · Туров: {data.counts.tours} · Матчей: {data.counts.matches}</p>
      <label>Этап: <select value={stageId} onChange={e => setStageId(e.target.value)}>
        <option value="all">Все этапы</option>
        {data.stages.map(stage => <option key={stage.id} value={String(stage.id)}>
          {stage.name}{stage.is_current ? " (текущий)" : ""}
        </option>)}
      </select></label>
      <p>Показано матчей: {filtered.length}</p>
      <div style={{ display: "grid", gap: 10 }}>
        {filtered.map(match => <article key={match.id} style={{ border: "1px solid #aaa", borderRadius: 8, padding: 14 }}>
          <small>{tourName(match.tour_id)}</small>
          <h2 style={{ fontSize: 18, margin: "8px 0" }}>{match.home_team || "Хозяева"} — {match.away_team || "Гости"}</h2>
          <strong>{match.home_score == null || match.away_score == null
            ? "Без результата" : `${match.home_score} : ${match.away_score}`}</strong>
          <div>Начало: {displayDate(match.kickoff_at)}</div>
          <div>Приём прогнозов до: {displayDate(match.deadline_at)}</div>
        </article>)}
      </div>
    </>}
  </main>;
}
