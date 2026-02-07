import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

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

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  const { data: currentStage } = await sb
    .from("stages")
    .select("status")
    .eq("is_current", true)
    .maybeSingle();

  const isLocked = (currentStage?.status ?? null) === "locked";

  return (
    <>
      {isLocked ? (
        <div className="dashLock">
          Этап закрыт (locked). Внесение изменений запрещено.
        </div>
      ) : null}

      {children}
    </>
  );
}
