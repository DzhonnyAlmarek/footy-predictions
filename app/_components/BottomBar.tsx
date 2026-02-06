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
  { href: "/dashboard", label: "Мои", icon: "✍️" },
  { href: "/dashboard/current", label: "Текущая", icon: "📊" },
  { href: "/golden-boot", label: "Бутса", icon: "🥇" },
  { href: "/logout", label: "Выйти", icon: "🚪", isLogout: true },
];

const adminItems: Item[] = [
  { href: "/admin", label: "Админ", icon: "🛠️" },
  { href: "/admin/results", label: "Рез-ты", icon: "✅" },
  { href: "/admin/users", label: "Юзеры", icon: "👥" },
  { href: "/logout", label: "Выйти", icon: "🚪", isLogout: true },
];

export default function BottomBar({ variant = "user" }: { variant?: "user" | "admin" }) {
  const pathname = usePathname() ?? "";
  const items = variant === "admin" ? adminItems : userItems;

  return (
    <nav className="bottomBar" aria-label="Нижнее меню">
      {items.map((i) => {
        const active =
          !i.isLogout && (pathname === i.href || pathname.startsWith(i.href + "/"));

        const cls = `bbItem ${active ? "bbActive" : ""}`;

        if (i.isLogout) {
          return (
            <a key={i.href} href={i.href} className={cls}>
              <span className="bbIcon" aria-hidden="true">{i.icon}</span>
              <span className="bbLabel">{i.label}</span>
            </a>
          );
        }

        return (
          <Link key={i.href} href={i.href} className={cls}>
            <span className="bbIcon" aria-hidden="true">{i.icon}</span>
            <span className="bbLabel">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
