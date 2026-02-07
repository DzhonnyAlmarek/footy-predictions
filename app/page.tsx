import LoginWidget from "./login-widget";

export default async function HomePage() {
  return (
    <main className="authPage">
      <div className="card authCard">
        <div className="authBrand">
          <div className="authTitle">Клуб им. А.Н. Мурашева</div>
          <div className="authSubtitle">Прогнозы • таблицы • рейтинги</div>
        </div>

        <div className="authHint">Выберите логин и введите пароль для входа</div>

        <div className="cardBody">
          <LoginWidget />
        </div>
      </div>
    </main>
  );
}
