import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
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

export default async function UserLayout({ children }: { children: ReactNode }) {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();

  if (!login) redirect("/");

  const sb = service();
  const { data: stage } = await sb
    .from("stages")
    .select("name,status")
    .eq("is_current", true)
    .maybeSingle();

  const nav = [
    // ✅ “Мои прогнозы” теперь ведёт на /dashboard/matches
    { href: "/dashboard/matches", label: "Мои прогнозы" },
   { href: "/dashboard", label: "Текущая таблица" },
    { href: "/analytics", label: "Аналитика" },
    { href: "/golden-boot", label: "Бутса" },
    { href: "/logout", label: "Выйти" },
  ];

  return (
    <>
      <AppHeader
        title="Клуб им. А.Н. Мурашева"
        login={login}
        stageName={stage?.name ?? null}
        stageStatus={stage?.status ?? null}
        nav={nav}
      />

      <div className="hasBottomBar">{children}</div>

      <BottomBar variant="user" />
    </>
  );
}