import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import GoldenWhistleStage from "@/app/_components/golden-whistle-stage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function mustEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env: ${name}`);
  return value;
}

function decodeMaybe(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function AdminGoldenWhistlePage() {
  const cookieStore = await cookies();
  const login = decodeMaybe(cookieStore.get("fp_login")?.value ?? "").trim().toUpperCase();
  if (login !== "ADMIN") redirect("/dashboard");

  const supabase = createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
  const { data: stage } = await supabase
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  if (!stage) redirect("/admin");
  return (
    <GoldenWhistleStage
      stageId={Number(stage.id)}
      stageName={String(stage.name)}
      stageStatus={String(stage.status ?? "")}
      backHref="/admin"
    />
  );
}
