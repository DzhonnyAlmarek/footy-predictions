"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = {
  href: string;
  label: string;
  icon: string;
  isLogout?: boolean;
};

const items: Item[] = [
  { href: "/dashboard", label: "Мои прогнозы", icon: "📊" },
  { href: "/dashboard/current", label: "Текущая таблица", icon: "📋" },
  { href: "/golden-boot", label: "Бутса", icon: "🥇" },
  { href: "/logout", label: "Выйти", icon: "🚪", isLogout: true },
];

export default function BottomBar() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        height: 64,
        display: "flex",
        justifyContent: "space-around",
        alignItems: "center",
        borderTop: "1px solid rgba(0,0,0,0.1)",
        background: "#fff",
        zIndex: 50,
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {items.map((i) => {
        const active =
          !i.isLogout &&
          (pathname === i.href || pathname.startsWith(i.href + "/"));

        if (i.isLogout) {
          return (
            <a
              key={i.href}
              href={i.href}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                fontSize: 12,
                fontWeight: 700,
                color: "#111",
                textDecoration: "none",
                opacity: 0.8,
              }}
            >
              <span style={{ fontSize: 20 }}>{i.icon}</span>
              {i.label}
            </a>
          );
        }

        return (
          <Link
            key={i.href}
            href={i.href}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
              fontSize: 12,
              fontWeight: 800,
              color: active ? "#000" : "#666",
              textDecoration: "none",
            }}
          >
            <span
              style={{
                fontSize: 20,
                transform: active ? "scale(1.1)" : "scale(1)",
              }}
            >
              {i.icon}
            </span>
            {i.label}
          </Link>
        );
      })}
    </nav>
  );
}
