import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import BackButton from "@/app/_components/back-button";

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
  // ✅ auth via fp_login
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
  const stageName = currentStage?.name ?? null;

  const isLocked = stageStatus === "locked";

  // ✅ считаем созданные матчи
  let created = 0;
  if (currentStage?.id) {
    const { count } = await sb
      .from("matches")
      .select("*", { count: "exact", head: true })
      .eq("stage_id", currentStage.id);

    created = Number(count ?? 0);
  }

  const remainingToCreate = Math.max(0, STAGE_MATCHES_TOTAL - created);

  function StageBadge() {
    if (!stageStatus) return null;

    if (isLocked) {
      return (
        <span className="badge badgeDanger">
          Этап закрыт
        </span>
      );
    }

    return (
      <span className="badge">
        {stageStatus}
      </span>
    );
  }

  function progressLine() {
    if (!currentStage?.id) return "Матчи этапа: —";

    if (created >= STAGE_MATCHES_TOTAL) {
      return `Матчи этапа: ${STAGE_MATCHES_TOTAL}/${STAGE_MATCHES_TOTAL} • все матчи созданы ✅`;
    }

    if (remainingToCreate <= 2) {
      const tail = remainingToCreate === 1 ? "остался 1 матч" : "осталось 2 матча";
      return `Матчи этапа: ${created}/${STAGE_MATCHES_TOTAL} • ${tail} 🔥`;
    }

    return `Матчи этапа: ${created}/${STAGE_MATCHES_TOTAL} • осталось создать ${remainingToCreate}`;
  }

  return (
    <div>
      <div className="dashTop">
        <div className="dashTopInner">
          <div className="dashTopLeft">
            <div className="dashTopLine1">
              <BackButton />

              {stageStatus ? (
                <div className="dashStageWrap">
                  <StageBadge />
                  <span className="dashStageText">
                    Текущий этап: <b>{stageName ?? `#${currentStage?.id}`}</b>
                  </span>
                </div>
              ) : (
                <span className="dashStageText">Текущий этап не выбран</span>
              )}
            </div>

            <div className="dashTopLine2">{progressLine()}</div>
          </div>

          {/* ✅ верхнее меню (оставляем) */}
          <div className="dashTopNav">
            <Link href="/dashboard/current">Текущая таблица</Link>
            <Link href="/golden-boot">Золотая бутса</Link>
            <Link href="/logout">Выйти</Link>
          </div>
        </div>
      </div>

      {isLocked ? (
        <div className="dashLock">
          Этап закрыт (locked). Внесение изменений запрещено.
        </div>
      ) : null}

      {children}
    </div>
  );
}
