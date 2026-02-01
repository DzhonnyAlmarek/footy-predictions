"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";

export default function AdminNav({ loginLabel }: { loginLabel: string }) {
  const pathnameRaw = usePathname();
  const pathname = pathnameRaw ?? "";

  function isActive(href: string) {
    return pathname === href || pathname.startsWith(href + "/");
  }

  const linkStyle = (active: boolean): CSSProperties => ({
    textDecoration: "none",
    padding: "6px 10px",
    borderRadius: 10,
    border: "1px solid rgba(0,0,0,0.10)",
    background: active ? "rgba(0,0,0,0.06)" : "transparent",
    fontWeight: 900,
    opacity: active ? 1 : 0.85,
  });

  return (
    <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
      <Link href="/admin" style={linkStyle(isActive("/admin"))}>
        Домой
      </Link>
      <Link href="/admin/current-table" style={linkStyle(isActive("/admin/current-table"))}>
        Текущая таблица
      </Link>
      <Link href="/admin/stages" style={linkStyle(isActive("/admin/stages"))}>
        Этапы
      </Link>
      <Link href="/admin/results" style={linkStyle(isActive("/admin/results"))}>
        Результаты
      </Link>
      <Link href="/admin/teams" style={linkStyle(isActive("/admin/teams"))}>
        Команды
      </Link>
      <Link href="/admin/users" style={linkStyle(isActive("/admin/users"))}>
        Пользователи
      </Link>
      <Link href="/logout" style={linkStyle(false)}>
        {loginLabel}
      </Link>
    </nav>
  );
}
