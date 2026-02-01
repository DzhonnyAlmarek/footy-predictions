"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <div
        style={{
          border: "1px solid rgba(220,38,38,0.25)",
          background: "rgba(220,38,38,0.05)",
          borderRadius: 14,
          padding: 16,
        }}
      >
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>Ошибка</h1>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          Что-то пошло не так. Попробуйте повторить.
        </p>

        <button
          onClick={() => reset()}
          style={{
            marginTop: 12,
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
      </div>
    </main>
  );
}
