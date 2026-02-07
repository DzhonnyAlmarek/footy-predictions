import Link from "next/link";

type NavItem = { href: string; label: string };

export default function AppHeader(props: {
  title?: string;
  login?: string; // "ADMIN" или логин
  stageName?: string | null;
  stageStatus?: string | null;
  nav: NavItem[];
  activePath?: string; // можно передать pathname, если есть
}) {
  const { title = "Footy Predictions", login, stageName, stageStatus, nav, activePath } = props;

  return (
    <header className="appHeader">
      <div className="appHeaderInner">
        <div className="appBrand">
          <Link href={login === "ADMIN" ? "/admin" : "/dashboard"} className="brandLink">
            ⚽ {title}
          </Link>

          <div className="brandMeta">
            {stageName ? (
              <span className="metaPill">
                Этап: <b>{stageName}</b>
                {stageStatus ? <span className="metaDot">•</span> : null}
                {stageStatus ? <span>{stageStatus}</span> : null}
              </span>
            ) : (
              <span className="metaPill">Этап не выбран</span>
            )}

            {login ? <span className="metaPill">Пользователь: <b>{login}</b></span> : null}
          </div>
        </div>

        <nav className="appNav">
          {nav.map((it) => {
            const isActive = activePath ? activePath === it.href : false;
            return (
              <Link key={it.href} href={it.href} className={`navLink ${isActive ? "navActive" : ""}`}>
                {it.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
