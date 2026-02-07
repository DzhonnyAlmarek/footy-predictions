import LoginWidget from "./login-widget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  return (
    <main className="authCenter">
      <div className="authWrap">
        <h1 className="authTitle">Клуб им. А.Н. Мурашева</h1>
        <div className="authSub">Прогнозы • таблицы • рейтинги</div>

        <div className="authCard">
          <LoginWidget />
        </div>
      </div>
    </main>
  );
}
