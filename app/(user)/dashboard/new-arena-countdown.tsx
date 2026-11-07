"use client";

import { useEffect, useState } from "react";

// 09.11.2026 00:00 MSK = 08.11.2026 21:00 UTC.
// Absolute target makes countdown independent of visitor device time zone.
const TARGET = Date.parse("2026-11-08T21:00:00Z");

function remaining(now: number) {
  const seconds = Math.max(0, Math.ceil((TARGET - now) / 1000));
  return {
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
    complete: seconds === 0,
  };
}

export default function NewArenaCountdown() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    refresh();
    const interval = window.setInterval(refresh, 1000);
    return () => window.clearInterval(interval);
  }, []);

  const time = remaining(now ?? TARGET + 1000);
  const units = [
    { label: "дней", value: time.days },
    { label: "часов", value: time.hours },
    { label: "минут", value: time.minutes },
    { label: "секунд", value: time.seconds },
  ];

  return (
    <section
      aria-label="Обратный отсчёт до переезда на новую арену"
      style={{
        maxWidth: 1120,
        margin: "16px auto 20px",
        padding: "20px 16px",
        borderRadius: 18,
        color: "#fff",
        textAlign: "center",
        background: "linear-gradient(120deg,#063d32,#145b4a 68%,#287c55)",
        boxShadow: "0 9px 22px rgba(0,45,31,.16)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: "clamp(19px,3.3vw,29px)", lineHeight: 1.2 }}>
        {now !== null && time.complete
          ? "Мы переехали на новую арену!"
          : "До переезда на новую арену осталось"}
      </div>
      {now !== null && time.complete ? (
        <a href="https://www.murashevclub.ru" style={{ display: "inline-block", marginTop: 14, color: "#e9ffad", fontWeight: 800, textDecoration: "underline" }}>
          Открыть новый сайт клуба
        </a>
      ) : (
        <>
          <div
            aria-live="off"
            style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, maxWidth: 500, margin: "16px auto 8px" }}
          >
            {units.map((unit) => (
              <div key={unit.label} style={{ background: "rgba(255,255,255,.13)", border: "1px solid rgba(255,255,255,.2)", padding: "10px 3px", borderRadius: 10 }}>
                <div style={{ fontSize: "clamp(25px,5vw,41px)", fontWeight: 900, fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>
                  {now === null ? "—" : String(unit.value).padStart(2, "0")}
                </div>
                <div style={{ fontSize: "clamp(10px,2vw,13px)", opacity: .9 }}>{unit.label}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 13, color: "#d6f0df" }}>9 ноября 2026 года, 00:00 МСК</div>
        </>
      )}
    </section>
  );
}
