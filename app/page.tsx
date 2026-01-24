import LoginWidget from "./login-widget";


export default async function HomePage() {
  // НИКАКИХ редиректов по роли/сессии.
  // Middleware уже сбрасывает сессию при заходе на "/".
  return (
    <main style={{ maxWidth: 520, margin: "0 auto", padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Вход</h1>
      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Выберите логин и введите пароль
      </p>

      <section style={{ marginTop: 16 }}>
        <LoginWidget />
      </section>
    </main>
  );
}
