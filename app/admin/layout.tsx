import { ReactNode } from "react";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import AppHeader from "@/app/_components/AppHeader";
import BottomBar from "@/app/_components/BottomBar";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();

  const sb = service();
  const { data: stage } = await sb
    .from("stages")
    .select("name,status")
    .eq("is_current", true)
    .maybeSingle();

  const nav = [
    { href: "/admin", label: "Админ" },
    { href: "/admin/current-table", label: "Таблица" },
    { href: "/admin/results", label: "Результаты" },
    { href: "/admin/stages", label: "Этапы" },
    { href: "/admin/users", label: "Участники" },

    // ✅ Telegram тест
    { href: "/admin/telegram-test", label: "Telegram тест" },

    { href: "/logout", label: "Выйти" },
  ];

  return (
    <>
      <AppHeader
        title="Клуб им. А.Н. Мурашева"
        login={login || "ADMIN"}
        stageName={stage?.name ?? null}
        stageStatus={stage?.status ?? null}
        nav={nav}
      />

      {children}

      <BottomBar variant="admin" />
    </>
  );
}