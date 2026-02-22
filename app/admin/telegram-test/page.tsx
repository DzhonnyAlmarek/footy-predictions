"use client";

import { useEffect, useMemo, useState } from "react";

type MatchItem = {
  id: number;
  kickoff_at: string;
  home: string;
  away: string;
  status: string;
};

type ApiListResp =
  | { ok: true; matches: MatchItem[] }
  | { ok: false; error: string; message?: string };

type ApiTestResp =
  | {
      ok: true;
      dryRun: boolean;
      match: { id: number; kickoff_at: string; home: string; away: string };
      missing: { total: number; names: string[] };
      preview: string;
      skipped?: boolean;
      reason?: string;
    }
  | { ok: false; error: string; message?: string };

export default function AdminTelegramTestPage() {
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchItem[]>([]);
  const [matchId, setMatchId] = useState<number | "">("");
  const [bucket, setBucket] = useState<"24h" | "12h" | "1h" | "15m">("15m");
  const [preview, setPreview] = useState<string>("");
  const [info, setInfo] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const selected = useMemo(() => {
    if (!matchId) return null;
    return matches.find((m) => m.id === matchId) ?? null;
  }, [matchId, matches]);

  async function loadMatches() {
    setErr("");
    setInfo("");
    try {
      const res = await fetch("/api/admin/telegram/test-reminder", { method: "GET" });
      const json = (await res.json()) as ApiListResp;
      if (!json.ok) throw new Error(json.message ?? json.error);
      setMatches(json.matches);
      if (json.matches.length > 0 && matchId === "") setMatchId(json.matches[0].id);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    loadMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(dryRun: boolean) {
    setLoading(true);
    setErr("");
    setInfo("");
    try {
      const res = await fetch("/api/admin/telegram/test-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket,
          matchId: matchId === "" ? null : matchId,
          dryRun,
          includeEvenIfNoMissing: true,
        }),
      });

      const json = (await res.json()) as ApiTestResp;
      if (!json.ok) throw new Error(json.message ?? json.error);

      setPreview(json.preview);

      const base =
        `Матч #${json.match.id}: ${json.match.home} — ${json.match.away}\n` +
        `kickoff_at: ${json.match.kickoff_at}\n` +
        `missing: ${json.missing.total}`;

      if (json.skipped) {
        setInfo(`Preview готов (SKIPPED: ${json.reason}).\n${base}`);
      } else if (dryRun) {
        setInfo(`Preview готов.\n${base}`);
      } else {
        setInfo(`Отправлено в Telegram ✅\n${base}`);
      }
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="hasBottomBar" style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 900, margin: 0 }}>Тест Telegram-напоминаний</h1>
          <div style={{ marginTop: 6, opacity: 0.85 }}>
            Админская проверка бота: preview и отправка тестового сообщения в группу.
          </div>
        </div>

        {/* ❌ topNav удалён — навигация только через AppHeader (десктоп) и BottomBar (мобилка) */}
      </header>

      <section style={{ marginTop: 18 }}>
        <div className="card" style={{ padding: 16 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end" }}>
            <div style={{ minWidth: 320 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Матч</div>
              <select
                value={matchId}
                onChange={(e) => setMatchId(e.target.value ? Number(e.target.value) : "")}
                style={{ width: "100%", padding: 10, borderRadius: 10 }}
              >
                {matches.length === 0 ? (
                  <option value="">(нет матчей в горизонте)</option>
                ) : (
                  matches.map((m) => (
                    <option key={m.id} value={m.id}>
                      #{m.id} — {m.home} — {m.away} — {m.kickoff_at}
                    </option>
                  ))
                )}
              </select>

              {selected ? (
                <div style={{ marginTop: 8, opacity: 0.85 }}>
                  Статус: <b>{selected.status}</b>
                </div>
              ) : null}
            </div>

            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Бакет</div>
              <select
                value={bucket}
                onChange={(e) => setBucket(e.target.value as any)}
                style={{ width: "100%", padding: 10, borderRadius: 10 }}
              >
                <option value="24h">24h</option>
                <option value="12h">12h</option>
                <option value="1h">1h</option>
                <option value="15m">15m</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="btn" onClick={() => run(true)} disabled={loading || matches.length === 0}>
                🧾 Preview
              </button>
              <button className="btn btnPrimary" onClick={() => run(false)} disabled={loading || matches.length === 0}>
                🚀 Отправить тест в Telegram
              </button>
              <button className="btn" onClick={() => loadMatches()} disabled={loading}>
                🔄 Обновить матчи
              </button>
            </div>
          </div>

          {err ? (
            <div style={{ marginTop: 12, color: "crimson", whiteSpace: "pre-wrap" }}>
              ❌ {err}
            </div>
          ) : null}

          {info ? (
            <div style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>
              {info}
            </div>
          ) : null}
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18, fontWeight: 900, margin: "0 0 10px" }}>Preview (HTML)</h2>
        <div className="card" style={{ padding: 16 }}>
          {!preview ? (
            <div style={{ opacity: 0.75 }}>Нажми “Preview”, чтобы увидеть текст.</div>
          ) : (
            <>
              <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{preview}</pre>
              <div style={{ marginTop: 12, opacity: 0.8 }}>
                Примечание: в Telegram это отправляется как <b>HTML</b> (parse_mode=HTML).
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}