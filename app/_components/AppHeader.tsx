"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string };

function isActive(pathname: string, href: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  // активен если точное совпадение или вложенный роут
  return pathname === href || pathname.startsWith(href + "/");
}

export default function AppHeader(props: {
  title: string;
  login?: string;
  stageName?: string | null;
  stageStatus?: string | null;
  nav: NavItem[];
}) {
  const pathname = usePathname() ?? "/";
  const { title, login, stageName, stageStatus, nav } = props;

  return (
    <header className="appHeader">
      <div className="appHeaderInner">
        <div className="appBrand">
          <Link href={login ? "/dashboard" : "/"} className="brandLink">
            {title}
          </Link>

          <div className="brandMeta">
            {stageName ? (
              <span className="metaPill">
                Этап: <b>{stageName}</b>
                {stageStatus ? <span className="metaDot">•</span> : null}
                {stageStatus ? <span>{stageStatus}</span> : null}
              </span>
            ) : (
              <span className="metaPill">
                Этап: <b>не выбран</b>
              </span>
            )}

            {login ? (
              <span className="metaPill">
                Логин: <b>{login}</b>
              </span>
            ) : null}
          </div>
        </div>

        <nav className="appNav" aria-label="Навигация">
          {nav.map((i) => {
            const active = isActive(pathname, i.href);
            return (
              <Link
                key={i.href}
                href={i.href}
                className={`navLink ${active ? "navActive" : ""}`}
              >
                {i.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
