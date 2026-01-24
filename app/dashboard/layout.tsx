import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BackButton from "@/app/_components/back-button";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) redirect("/");

  const { data: acc } = await supabase
    .from("login_accounts")
    .select("must_change_password")
    .eq("user_id", user.id)
    .maybeSingle();

  if (acc?.must_change_password) redirect("/change-password");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role === "admin") redirect("/admin");

  const loginLabel = profile?.username ? `Выйти (${profile.username})` : "Выйти";

  return (
    <div>
      <div style={{ borderBottom: "1px solid #eee", padding: "12px 24px" }}>
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <BackButton />
            <Link href="/dashboard/stages" style={{ textDecoration: "underline" }}>
              Домой
            </Link>
          </div>

          {/* ЕДИНСТВЕННОЕ МЕНЮ */}
          <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Link href="/dashboard/stages">Этапы</Link>
            <Link href="/rating">Рейтинг</Link>
            <Link href="/logout">{loginLabel}</Link>
          </nav>
        </div>
      </div>

      {children}
    </div>
  );
}
