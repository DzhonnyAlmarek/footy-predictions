"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  icon: string;
  isLogout?: boolean;
};

const userItems: Item[] = [
  { href: "/dashboard/matches", label: "Прогнозы", icon: "✍️" },
  { href: "/dashboard/current", label: "Таблица", icon: "📊" },
  { href: "/dashboard/archive", label: "Архив", icon: "🗂️" },
  { href: "/analytics", label: "Аналитика", icon: "📈" },
  { href: "/golden-boot", label: "Бутса", icon: "🥇" },
];

const adminItems: Item[] = [
  { href: "/admin", label: "Админ", icon: "🛠️" },
  { href: "/admin/current-table", label: "Таблица", icon: "📊" },
  { href: "/admin/results", label: "Рез-ты", icon: "✅" },
  { href: "/admin/users", label: "Юзеры", icon: "👥" },
  { href: "/logout", label: "Выйти", icon: "🚪", isLogout: true },
];

function isActivePath(pathname: string, href: string) {
  if (!href) return false;
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function BottomBar({
  variant = "user",
}: {
  variant?: "user" | "admin";
}) {
  const pathname = usePathname() ?? "";
  const items: Item[] = variant === "admin" ? adminItems : userItems;

  return (
    <nav className="bottomBar" aria-label="Нижнее меню">
      <div className="bottomBarInner">
        {items.map((i) => {
          const active = !i.isLogout && isActivePath(pathname, i.href);
          const cls = `bbItem ${active ? "bbActive" : ""}`;

          if (i.isLogout) {
            return (
              <a key={i.href} href={i.href} className={cls}>
                <span className="bbIcon" aria-hidden="true">
                  {i.icon}
                </span>
                <span className="bbLabel">{i.label}</span>
              </a>
            );
          }

          return (
            <Link key={i.href} href={i.href} className={cls}>
              <span className="bbIcon" aria-hidden="true">
                {i.icon}
              </span>
              <span className="bbLabel">{i.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}