"use client";

import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru">
      <body>
        <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
          <div
            style={{
              border: "1px solid rgba(220,38,38,0.25)",
              background: "rgba(220,38,38,0.05)",
              borderRadius: 14,
              padding: 16,
            }}
          >
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Критическая ошибка</h1>
            <p style={{ marginTop: 8, opacity: 0.85 }}>
              Что-то пошло не так. Попробуйте повторить или вернуться на главную.
            </p>

            <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                onClick={() => reset()}
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
                Повторить
              </button>

              <Link href="/" style={{ textDecoration: "underline", fontWeight: 800 }}>
                На главную
              </Link>

              <Link href="/logout" style={{ textDecoration: "underline", fontWeight: 800 }}>
                Выйти
              </Link>
            </div>

            {process.env.NODE_ENV !== "production" ? (
              <pre style={{ marginTop: 12, opacity: 0.8, whiteSpace: "pre-wrap" }}>
                {String(error?.message ?? error)}
              </pre>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
