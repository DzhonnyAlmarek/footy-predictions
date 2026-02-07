"use client";

import { useMemo } from "react";

type Part = { label: string; value: number };

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function fmt(n: number) {
  const v = round2(n);
  // чтобы 2.5 не превращалось в 2.50
  return Number.isInteger(v) ? String(v) : String(v);
}

export default function PointsBreakdown(props: {
  total: number;
  parts: Part[];
  compact?: boolean;
}) {
  const totalText = useMemo(() => fmt(props.total), [props.total]);

  // если не надо показывать (например прогноз пустой)
  if (!Number.isFinite(props.total)) return null;

  return (
    <details
      style={{
        display: "inline-block",
        marginLeft: props.compact ? 6 : 8,
        verticalAlign: "middle",
      }}
    >
      <summary
        style={{
          cursor: "pointer",
          listStyle: "none",
          display: "inline",
          opacity: 0.8,
          fontWeight: 800,
        }}
        title="Нажми чтобы увидеть расшифровку"
      >
        ({totalText})
      </summary>

      <div
        style={{
          marginTop: 6,
          padding: 10,
          borderRadius: 12,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(255,255,255,0.98)",
          boxShadow: "0 10px 24px rgba(0,0,0,0.12)",
          minWidth: 240,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 6 }}>
          Баллы за матч: {totalText}
        </div>

        <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
          {props.parts
            .filter((p) => Math.abs(p.value) > 1e-9)
            .map((p) => (
              <div
                key={p.label}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <span style={{ opacity: 0.8 }}>{p.label}</span>
                <span style={{ fontWeight: 900 }}>{fmt(p.value)}</span>
              </div>
            ))}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7 }}>
          Закрой: кликни ещё раз по ({totalText})
        </div>
      </div>
    </details>
  );
}
