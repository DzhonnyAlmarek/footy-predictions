import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
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

function getSiteUrl(): string {
  // 1) Явная настройка (рекомендую)
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  // 2) Vercel системная (если SITE_URL не задан)
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  // 3) Фолбэк
  return "https://footy-predictions.vercel.app";
}

function fmtRuDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);

  // Пользователь в NL, но матчевое расписание обычно удобно показывать локально для клуба.
  // Если хочешь — поменяй timeZone на "Europe/Moscow" или убери совсем.
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type TeamObj = { name: string } | { name: string }[] | null;

function teamName(t: TeamObj): string {
  if (!t) return "?";
  const anyT: any = t as any;
  if (Array.isArray(anyT)) return String(anyT?.[0]?.name ?? "?");
  return String(anyT?.name ?? "?");
}

async function tgSendMessage(text: string) {
  const token = mustEnv("TELEGRAM_BOT_TOKEN");
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
}

async function getNextMatchLine(sb: ReturnType<typeof service>) {
  // текущий этап (если есть)
  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (sErr) throw new Error(`stage_failed: ${sErr.message}`);

  const nowIso = new Date().toISOString();

  let q = sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      deadline_at,
      status,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    // ближайший матч после "сейчас"
    .gt("kickoff_at", nowIso)
    .order("kickoff_at", { ascending: true })
    .limit(1);

  if (stage?.id) q = q.eq("stage_id", Number(stage.id));

  const { data, error } = await q;
  if (error) throw new Error(`next_match_failed: ${error.message}`);

  const m: any = (data ?? [])[0];
  if (!m?.id) return `Ближайший матч: —`;

  const home = teamName(m.home_team);
  const away = teamName(m.away_team);

  return `Ближайший матч: <b>${fmtRuDateTime(m.kickoff_at)}</b> · ${home} — ${away}`;
}

export async function POST(req: Request) {
  // простая защита для cron
  const auth = req.headers.get("authorization") ?? "";
  const secret = mustEnv("CRON_SECRET");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const sb = service();
    const site = getSiteUrl();
    const dashboardUrl = `${site}/dashboard`;

    const nextMatchLine = await getNextMatchLine(sb);

    const text =
      `⚽ <b>Напоминание</b>\n` +
      `Проверьте прогнозы на ближайшие матчи.\n\n` +
      `${nextMatchLine}\n` +
      `Открыть: ${dashboardUrl}`;

    await tgSendMessage(text);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "broadcast_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}