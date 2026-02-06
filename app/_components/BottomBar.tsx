"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Variant = "user" | "admin";

type Item = {
  href: string;
  label: string;
  icon: string;
  isLogout?: boolean;
};

const userItems: Item[] = [
  { href: "/dashboard", label: "Мои", icon: "✍️" },
  { href: "/dashboard/current", label: "Таблица", icon: "📊" },
  { href: "/golden-boot", label: "Бутса", icon: "🥇" },
  { href: "/logout", label: "Выйти", icon: "🚪", isLogout: true },
];

const adminItems: Item[] = [
  { href: "/admin", label: "Админ", icon: "🛠️" },
  { href: "/admin/current-table", label: "Таблица", icon: "📊" },
  { href: "/admin/users", label: "Юзеры", icon: "👥" },
  { href: "/logout", label: "Выйти", icon: "🚪", isLogout: true },
];

export default function BottomBar({ variant = "user" }: { variant?: Variant }) {
  const pathnameRaw = usePathname();
  const pathname = pathnameRaw ?? ""; // ✅ фикс: null → ""

  const items = variant === "admin" ? adminItems : userItems;

  return (
    <nav className="bottomBar" aria-label="Bottom navigation">
      {items.map((i) => {
        const active =
          !i.isLogout &&
          (pathname === i.href || pathname.startsWith(i.href + "/"));

        // logout лучше через обычный <a>, чтобы точно отработал route.ts /logout
        if (i.isLogout) {
          return (
            <a key={i.href} href={i.href} className="bbItem">
              <span className="bbIcon" aria-hidden="true">
                {i.icon}
              </span>
              <span className="bbLabel">{i.label}</span>
            </a>
          );
        }

        return (
          <Link
            key={i.href}
            href={i.href}
            className={`bbItem ${active ? "bbActive" : ""}`}
          >
            <span className="bbIcon" aria-hidden="true">
              {i.icon}
            </span>
            <span className="bbLabel">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
