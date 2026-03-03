import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

const adminLinks: Array<{ href: string; label: string }> = [
  { href: "/admin", label: "Админ" },
  { href: "/admin/current-table", label: "Таблица" },
  { href: "/admin/results", label: "Результаты" },
  { href: "/admin/stages", label: "Этапы" },
  { href: "/admin/users", label: "Участники" },
  { href: "/admin/telegram-test", label: "Telegram тест" },

  // ✅ НОВОЕ
  { href: "/admin/backups", label: "💾 Бэкапы" },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cs = await cookies();
  const login = decodeMaybe(cs.get("fp_login")?.value ?? "").trim().toUpperCase();

  if (!login) redirect("/");
  if (login !== "ADMIN") redirect("/dashboard");

  return (
    <div className="page">
      <div className="adminTopNav" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        {adminLinks.map((l) => (
          <Link key={l.href} href={l.href} className="pill">
            {l.label}
          </Link>
        ))}

        <a className="pill" href="/logout">
          Выйти
        </a>
      </div>

      <div style={{ marginTop: 16 }}>{children}</div>
    </div>
  );
}