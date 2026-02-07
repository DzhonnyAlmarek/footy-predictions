import { ReactNode } from "react";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import AppHeader from "@/app/_components/AppHeader";

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

  const sb = service();
  const { data: stage } = await sb
    .from("stages")
    .select("name,status")
    .eq("is_current", true)
    .maybeSingle();

  const nav = [
    { href: "/dashboard", label: "Мои прогнозы" },
    { href: "/dashboard/current", label: "Текущая таблица" },
    { href: "/golden-boot", label: "Бутса" },
    { href: "/leaderboard", label: "Лидерборд" },
    { href: "/logout", label: "Выйти" },
  ];

  return (
    <>
      <AppHeader
        title="Клуб им. А.Н. Мурашева"
        login={login || undefined}
        stageName={stage?.name ?? null}
        stageStatus={stage?.status ?? null}
        nav={nav}
      />
      {children}
    </>
  );
}
