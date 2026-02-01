import SiteHeader from "./_components/SiteHeader";
import LoginWidget from "./login-widget";

export default async function HomePage() {
  return (
    <>
      <SiteHeader />

      <main
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "32px 16px", // 32 сверху/снизу, 16 по бокам
        }}
      >
        <div className="card">
          <div
            style={{
              marginBottom: 16, // строго по сетке
              fontSize: 14,
              opacity: 0.75,
              lineHeight: 1.4,
            }}
          >
            Выберите логин и введите пароль для входа
          </div>

          <div className="cardBody">
            <LoginWidget />
          </div>
        </div>
      </main>
    </>
  );
}
