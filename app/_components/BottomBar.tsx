"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/dashboard", label: "Таблица", icon: "📊" },
  { href: "/golden-boot", label: "Бутса", icon: "🥇" },
  { href: "/logout", label: "Выйти", icon: "🚪", isLogout: true },
];

export default function BottomBar() {
  const pathnameMaybe = usePathname();
  const pathname = pathnameMaybe ?? ""; // ✅ TS fix: string, never null

  return (
    <nav className="mobileBottomBar" aria-label="Навигация">
      {items.map((i) => {
        const active =
          !i.isLogout &&
          (pathname === i.href || pathname.startsWith(i.href + "/"));

        if (i.isLogout) {
          return (
            <a key={i.href} href={i.href} className="mbItem">
              <span className="mbIcon">{i.icon}</span>
              <span className="mbText">{i.label}</span>
            </a>
          );
        }

        return (
          <Link
            key={i.href}
            href={i.href}
            className={`mbItem ${active ? "active" : ""}`}
            aria-current={active ? "page" : undefined}
          >
            <span className="mbIcon">{i.icon}</span>
            <span className="mbText">{i.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
