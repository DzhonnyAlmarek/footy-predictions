import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function service() {
  return createClient(
    mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
    mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
}

// ✅ ВАЖНО: params теперь Promise, чтобы удовлетворить PageProps в Next.js
type Props = { params: Promise<{ userId: string }> };

export default async function AnalyticsUserPage({ params }: Props) {
  const sb = service();

  // ✅ ВАЖНО: получаем userId через await
  const { userId } = await params;

  const { data: account } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .eq("user_id", userId)
    .maybeSingle();

  if (!account) notFound();

  const { data: profile } = await sb
    .from("profiles")
    .select("display_name")
    .eq("id", userId)
    .maybeSingle();

  const { data: stage } = await sb
    .from("stages")
    .select("id,name")
    .eq("is_current", true)
    .maybeSingle();

  const { data: agg } = await sb
    .from("analytics_stage_user")
    .select("*")
    .eq("stage_id", stage?.id)
    .eq("user_id", userId)
    .maybeSingle();

  const matches = agg?.matches_count ?? 0;

  function pct(a: number, b: number) {
    if (!b) return "0%";
    return `${Math.round((a / b) * 100)}%`;
  }

  return (
    <div className="page">
      <h1>
        {(profile?.display_name ?? "").trim() ||
          account.login ||
          userId.slice(0, 8)}
      </h1>

      <div className="pageMeta">
        Этап: <b>{stage?.name}</b>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="cardBody">
          <div className="kpiRow">
            <div className="kpi">
              <div className="kpiLabel">Матчей</div>
              <div className="kpiValue">{matches}</div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Точный</div>
              <div className="kpiValue">
                {pct(agg?.exact_count ?? 0, matches)}
              </div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Исход</div>
              <div className="kpiValue">
                {pct(agg?.outcome_hit_count ?? 0, matches)}
              </div>
            </div>
            <div className="kpi">
              <div className="kpiLabel">Разница</div>
              <div className="kpiValue">
                {pct(agg?.diff_hit_count ?? 0, matches)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <Link href="/analytics" className="navLink">
          ← Назад к списку
        </Link>
      </div>
    </div>
  );
}