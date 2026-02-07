import SiteHeader from "./_components/SiteHeader";
import LoginWidget from "./login-widget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  return (
    <>
      <SiteHeader />

      <main
        style={{
          maxWidth: 520,
          margin: "0 auto",
          padding: "28px 16px 36px",
        }}
      >
        <div className="card">
          <div
            style={{
              padding: 16,
              borderBottom: "1px solid rgba(17,24,39,.10)",
              fontWeight: 900,
              fontSize: 14,
              color: "rgba(17,24,39,.70)",
            }}
          >
            Выберите свой логин и введите пароль для входа
          </div>

          <div className="cardBody">
            <LoginWidget />
          </div>
        </div>
      </main>
    </>
  );
}
