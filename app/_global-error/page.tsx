export const dynamic = "force-static";
export const revalidate = false;

import Link from "next/link";

export default function GlobalErrorRoute() {
  // ВАЖНО: никаких cookies()/headers()/supabase здесь не используем.
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
          Произошла ошибка. Вернитесь на главную страницу.
        </p>

        <div style={{ marginTop: 12, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <Link href="/" style={{ textDecoration: "underline", fontWeight: 800 }}>
            На главную
          </Link>
          <Link href="/dashboard" style={{ textDecoration: "underline", fontWeight: 800 }}>
            В кабинет
          </Link>
        </div>
      </div>
    </main>
  );
}
