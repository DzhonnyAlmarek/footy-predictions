import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import BackButton from "@/app/_components/back-button";

const STAGE_MATCHES_TOTAL = 56;

export const dynamic = "force-dynamic";
export const revalidate = 0;

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
  // ✅ AUTH как везде у пользователя: fp_login
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
  const isPublished = stageStatus === "published";
  const isDraft = stageStatus === "draft";

  // ✅ считаем СОЗДАННЫЕ матчи
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
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(220,38,38,0.35)",
            background: "rgba(220,38,38,0.10)",
            fontSize: 12,
            fontWeight: 900,
            color: "crimson",
          }}
        >
          Этап закрыт
        </span>
      );
    }

    if (isPublished) {
      return (
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(234,179,8,0.45)",
            background: "rgba(234,179,8,0.14)",
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          Этап опубликован
        </span>
      );
    }

    if (isDraft) {
      return (
        <span
          style={{
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid rgba(0,0,0,0.12)",
            background: "rgba(0,0,0,0.04)",
            fontSize: 12,
            fontWeight: 900,
            opacity: 0.75,
          }}
        >
          Draft
        </span>
      );
    }

    return (
      <span
        style={{
          padding: "4px 10px",
          borderRadius: 999,
          border: "1px solid rgba(0,0,0,0.12)",
          background: "rgba(0,0,0,0.04)",
          fontSize: 12,
          fontWeight: 900,
          opacity: 0.75,
        }}
      >
        {stageStatus}
      </span>
    );
  }

  function progressLine() {
    if (!currentStage?.id) return "Матчи этапа: —";

    if (created >= STAGE_MATCHES_TOTAL) {
      return `Матчи этапа (создано): ${STAGE_MATCHES_TOTAL} / ${STAGE_MATCHES_TOTAL} • все матчи созданы ✅`;
    }

    if (remainingToCreate <= 2) {
      const tail = remainingToCreate === 1 ? "остался 1 матч" : "осталось 2 матча";
      return `Матчи этапа (создано): ${created} / ${STAGE_MATCHES_TOTAL} • ${tail} 🔥`;
    }

    return `Матчи этапа (создано): ${created} / ${STAGE_MATCHES_TOTAL} • осталось создать ${remainingToCreate}`;
  }

  return (
    <div>
      {/* ✅ хедер поверх любых sticky таблиц */}
      <div
        style={{
          borderBottom: "1px solid #eee",
          padding: "12px 24px",
          position: "relative",
          zIndex: 60,
          background: "#fff",
          pointerEvents: "auto",
        }}
      >
        <div
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <BackButton />

              {stageStatus ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <StageBadge />
                  <span style={{ fontSize: 13, opacity: 0.8 }}>
                    Текущий этап: <b>{stageName ?? `#${currentStage?.id}`}</b>
                  </span>
                </div>
              ) : (
                <span style={{ fontSize: 13, opacity: 0.75 }}>Текущий этап не выбран</span>
              )}
            </div>

            <div style={{ fontSize: 13, opacity: 0.8 }}>{progressLine()}</div>

            {/* ✅ верхние ссылки */}
            <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
              <Link href="/dashboard" style={{ textDecoration: "underline" }}>
                Мои прогнозы
              </Link>
              <Link href="/dashboard/current" style={{ textDecoration: "underline" }}>
                Текущая таблица
              </Link>
              <Link href="/golden-boot" style={{ textDecoration: "underline" }}>
                Золотая бутса
              </Link>
              <Link href="/logout" style={{ textDecoration: "underline" }}>
                Выйти
              </Link>
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.65, fontWeight: 800 }}>
            {fpLogin}
          </div>
        </div>
      </div>

      {isLocked ? (
        <div style={{ padding: "12px 24px" }}>
          <div
            style={{
              maxWidth: 1100,
              margin: "0 auto",
              padding: 12,
              borderRadius: 12,
              border: "1px solid rgba(220,38,38,0.35)",
              background: "rgba(220,38,38,0.08)",
              color: "crimson",
              fontWeight: 900,
            }}
          >
            Этап закрыт (locked). Внесение изменений запрещено.
          </div>
        </div>
      ) : null}

      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
}
