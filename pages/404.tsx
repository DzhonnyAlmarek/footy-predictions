export default function Custom404() {
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, margin: 0 }}>404</h1>
      <p style={{ marginTop: 10, opacity: 0.85 }}>Страница не найдена.</p>
      <p style={{ marginTop: 12 }}>
        <a href="/" style={{ textDecoration: "underline", fontWeight: 800 }}>
          На главную
        </a>
      </p>
    </main>
  );
}
