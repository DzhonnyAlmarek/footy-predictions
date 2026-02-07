import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

const STAGE_MATCHES_TOTAL = 56;

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

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // auth via fp_login
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();
  if (!fpLogin) redirect("/");

  const sb = service();

  const { data: currentStage } = await sb
    .from("stages")
    .select("id,name,status")
    .eq("is_current", true)
    .maybeSingle();

  const stageStatus = currentStage?.status ?? null;
  const isLocked = stageStatus === "locked";

  // (опционально) прогресс матчей
  let created = 0;
  if (currentStage?.id) {
    const { count } = await sb
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("stage_id", currentStage.id);

    created = Number(count ?? 0);
  }
  const remaining = Math.max(0, STAGE_MATCHES_TOTAL - created);

  const progressText = !currentStage?.id
    ? "Матчи этапа: —"
    : created >= STAGE_MATCHES_TOTAL
    ? `Матчи этапа: ${STAGE_MATCHES_TOTAL}/${STAGE_MATCHES_TOTAL} • все матчи созданы ✅`
    : `Матчи этапа: ${created}/${STAGE_MATCHES_TOTAL} • осталось создать ${remaining}`;

  return (
    <>
      {/* ВАЖНО: тут больше нет “верхнего меню/текста” — этим занимается общий AppHeader */}
      {isLocked ? (
        <div className="dashLock">
          Этап закрыт (locked). Внесение изменений запрещено.
          <div style={{ marginTop: 6, opacity: 0.8, fontWeight: 800 }}>
            {progressText}
          </div>
        </div>
      ) : (
        // если этап не locked — просто мягкая инфа (не обязательно)
        <div
          style={{
            maxWidth: 1200,
            margin: "10px auto 0",
            padding: "0 16px",
            color: "rgba(17,24,39,.55)",
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          {progressText}
        </div>
      )}

      {children}
    </>
  );
}
