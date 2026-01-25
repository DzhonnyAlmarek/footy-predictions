"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

function parsePred(initialPred: string) {
  const m = (initialPred || "").match(/^(\d+)\s*:\s*(\d+)$/);
  if (!m) return { h: "", a: "" };
  return { h: m[1], a: m[2] };
}

export default function MyPredictionCell(props: {
  matchId: number;
  deadlineAt: string;        // ISO
  initialPred: string;       // "h:a" или ""
  initialPoints: number | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const init = parsePred(props.initialPred);

  const [h, setH] = useState(init.h);
  const [a, setA] = useState(init.a);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ мягкая подсветка после сохранения
  const [flashOk, setFlashOk] = useState(false);
  const flashTimerRef = useRef<any>(null);

  const homeRef = useRef<HTMLInputElement | null>(null);
  const awayRef = useRef<HTMLInputElement | null>(null);

  const deadlineMs = useMemo(() => new Date(props.deadlineAt).getTime(), [props.deadlineAt]);
  const locked = Date.now() >= deadlineMs;

  // запоминаем последнее сохранённое значение, чтобы не слать одинаковые upsert
  const lastSavedRef = useRef<string>(props.initialPred || "");

  useEffect(() => {
    const p = parsePred(props.initialPred);
    setH(p.h);
    setA(p.a);
    setErr(null);
    lastSavedRef.current = props.initialPred || "";
  }, [props.initialPred, props.initialPoints]);

  useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  function normalizeNum(v: string) {
    return v.replace(/[^\d]/g, "");
  }

  function triggerFlash() {
    setFlashOk(true);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashOk(false), 500);
  }

  async function save() {
    setErr(null);

    if (locked) {
      setErr("дедлайн прошёл");
      return;
    }

    // пустое не сохраняем
    if (h === "" || a === "") return;

    const hh = Number(h);
    const aa = Number(a);

    if (!Number.isInteger(hh) || !Number.isInteger(aa) || hh < 0 || aa < 0) {
      setErr("целые числа ≥ 0");
      return;
    }

    const predStr = `${hh}:${aa}`;
    if (predStr === lastSavedRef.current) return; // уже сохранено

    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("not_authenticated");

      const { error } = await supabase
        .from("predictions")
        .upsert(
          { user_id: uid, match_id: props.matchId, home_pred: hh, away_pred: aa },
          { onConflict: "user_id,match_id" }
        );

      if (error) throw error;

      lastSavedRef.current = predStr;

      // ✅ подсветка "успешно" без галочек/текста
      triggerFlash();
    } catch (e: any) {
      setErr(e?.message ?? "ошибка сохранения");
    } finally {
      setSaving(false);
    }
  }

  function onHomeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      awayRef.current?.focus();
    }
  }

  function onAwayKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      save();
    }
  }

  function onBlur() {
    save();
  }

  // дедлайн прошёл — только отображение
  if (locked) {
    const text = props.initialPred ? props.initialPred : "—";
    return (
      <div style={{ fontWeight: 900, textAlign: "center" }}>
        {text}
        {typeof props.initialPoints === "number" ? (
          <span style={{ opacity: 0.85 }}> ({props.initialPoints})</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gap: 6,
        justifyItems: "center",
        borderRadius: 10,
        padding: "2px 4px",
        background: flashOk ? "#eaffea" : "transparent", // ✅ мягкий зелёный
        transition: "background 150ms ease",
      }}
    >
      <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "center" }}>
        <input
          ref={homeRef}
          value={h}
          onChange={(e) => setH(normalizeNum(e.target.value))}
          onKeyDown={onHomeKeyDown}
          onBlur={onBlur}
          inputMode="numeric"
          disabled={saving}
          style={{
            width: 42,
            padding: "8px 6px",
            borderRadius: 10,
            border: "1px solid #ddd",
            textAlign: "center",
            fontWeight: 900,
            opacity: saving ? 0.7 : 1,
          }}
        />
        <span style={{ fontWeight: 900 }}>:</span>
        <input
          ref={awayRef}
          value={a}
          onChange={(e) => setA(normalizeNum(e.target.value))}
          onKeyDown={onAwayKeyDown}
          onBlur={onBlur}
          inputMode="numeric"
          disabled={saving}
          style={{
            width: 42,
            padding: "8px 6px",
            borderRadius: 10,
            border: "1px solid #ddd",
            textAlign: "center",
            fontWeight: 900,
            opacity: saving ? 0.7 : 1,
          }}
        />
      </div>

      {err ? (
        <div style={{ fontSize: 12, color: "crimson", fontWeight: 900, textAlign: "center" }}>
          {err}
        </div>
      ) : null}
    </div>
  );
}
