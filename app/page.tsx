import LoginWidget from "./login-widget";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function HomePage() {
  return (
    <main className="authCenter">
      <div className="authWrap">
        {/* Название сайта — строго по центру */}
        <div className="authHead">
          <h1 className="authTitle">Клуб им. А.Н. Мурашева</h1>
          <div className="authSub">
            Прогнозы • таблицы • рейтинги
          </div>
        </div>

        {/* Карточка логина */}
        <div className="authCard">
          <div className="authHint">
            Выберите логин и введите пароль для входа
          </div>

          <LoginWidget />
        </div>
      </div>
    </main>
  );
}
