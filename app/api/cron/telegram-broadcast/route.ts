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
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;

  return "https://footy-predictions.vercel.app";
}

// ---------- formatting helpers ----------
function escapeHtml(s: string): string {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fmtRuDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRemain(ms: number): string {
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "0м";

  const totalMin = Math.floor(ms / 60000);
  const dd = Math.floor(totalMin / (60 * 24));
  const hh = Math.floor((totalMin % (60 * 24)) / 60);
  const mm = totalMin % 60;

  const parts: string[] = [];
  if (dd) parts.push(`${dd}д`);
  if (hh) parts.push(`${hh}ч`);
  if (mm || parts.length === 0) parts.push(`${mm}м`);
  return parts.join(" ");
}

type TeamObj = { name: string } | { name: string }[] | null;

function teamName(t: TeamObj): string {
  if (!t) return "?";
  const anyT: any = t as any;
  if (Array.isArray(anyT)) return String(anyT?.[0]?.name ?? "?");
  return String(anyT?.name ?? "?");
}

// ---------- telegram ----------
async function tgSendMessage(params: {
  text: string;
  buttonUrl: string;
  buttonText?: string;
  extraButtonUrl?: string;
  extraButtonText?: string;
}) {
  const token = mustEnv("TELEGRAM_BOT_TOKEN");
  const chatId = mustEnv("TELEGRAM_CHAT_ID");

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const inline_keyboard: Array<Array<{ text: string; url: string }>> = [
    [{ text: params.buttonText ?? "Открыть дашборд", url: params.buttonUrl }],
  ];

  if (params.extraButtonUrl) {
    inline_keyboard.push([
      { text: params.extraButtonText ?? "Открыть матч", url: params.extraButtonUrl },
    ]);
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: params.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
}

// ---------- business logic ----------
const HOURS_24_MS = 24 * 60 * 60 * 1000;

async function getNearestMatch(sb: ReturnType<typeof service>) {
  const nowIso = new Date().toISOString();

  const { data: stage, error: sErr } = await sb
    .from("stages")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  if (sErr) throw new Error(`stage_failed: ${sErr.message}`);

  // ближайший по deadline_at (логично для напоминаний)
  let q = sb
    .from("matches")
    .select(
      `
      id,
      stage_id,
      kickoff_at,
      deadline_at,
      status,
      stage_match_no,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .gt("deadline_at", nowIso)
    .order("deadline_at", { ascending: true })
    .limit(1);

  if (stage?.id) q = q.eq("stage_id", Number(stage.id));

  const { data, error } = await q;
  if (error) throw new Error(`nearest_match_failed: ${error.message}`);

  const m: any = (data ?? [])[0];
  if (m?.id) return m;

  // fallback — если deadline_at не используется
  let q2 = sb
    .from("matches")
    .select(
      `
      id,
      stage_id,
      kickoff_at,
      deadline_at,
      status,
      stage_match_no,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .gt("kickoff_at", nowIso)
    .order("kickoff_at", { ascending: true })
    .limit(1);

  if (stage?.id) q2 = q2.eq("stage_id", Number(stage.id));

  const { data: data2, error: err2 } = await q2;
  if (err2) throw new Error(`nearest_match_fallback_failed: ${err2.message}`);

  return (data2 ?? [])[0] ?? null;
}

/**
 * Берём участников из login_accounts (исключаем ADMIN).
 * Имя = login.
 */
async function getParticipants(sb: ReturnType<typeof service>) {
  const { data: accounts, error: aErr } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .not("user_id", "is", null);

  if (aErr) throw new Error(`accounts_failed: ${aErr.message}`);

  const real = (accounts ?? []).filter(
    (a: any) => String(a?.login ?? "").trim().toUpperCase() !== "ADMIN"
  );

  const userIds = Array.from(new Set(real.map((a: any) => String(a.user_id))));

  const nameById = new Map<string, string>();
  for (const a of real) {
    const uid = String(a.user_id);
    const name = String(a.login ?? "").trim() || uid.slice(0, 8);
    if (uid) nameById.set(uid, name);
  }

  return { userIds, nameById };
}

/**
 * Кто НЕ поставил прогноз на матч:
 * нет строки в predictions или home_pred/away_pred null.
 */
async function getMissingUsersForMatch(
  sb: ReturnType<typeof service>,
  matchId: number,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const { data: preds, error: prErr } = await sb
    .from("predictions")
    .select("user_id,home_pred,away_pred")
    .eq("match_id", matchId)
    .in("user_id", userIds);

  if (prErr) throw new Error(`predictions_failed: ${prErr.message}`);

  const done = new Set<string>();
  for (const p of preds ?? []) {
    const uid = String((p as any).user_id);
    const h = (p as any).home_pred;
    const a = (p as any).away_pred;
    if (uid && h != null && a != null) done.add(uid);
  }

  const missing = new Set<string>();
  for (const uid of userIds) if (!done.has(uid)) missing.add(uid);

  return missing;
}

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = mustEnv("CRON_SECRET");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const sb = service();
    const site = getSiteUrl();

    const dashUrl = `${site}/dashboard`;

    const match = await getNearestMatch(sb);
    if (!match?.id) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_upcoming_matches" });
    }

    const matchId = Number(match.id);
    const home = teamName(match.home_team);
    const away = teamName(match.away_team);

    const kickoffAt = match.kickoff_at as string | null;
    const deadlineAt = (match.deadline_at as string | null) ?? kickoffAt;

    const now = Date.now();
    const deadlineMs = deadlineAt ? new Date(deadlineAt).getTime() : NaN;
    const remainMs = Number.isFinite(deadlineMs) ? deadlineMs - now : NaN;

    const { userIds, nameById } = await getParticipants(sb);
    const missing = await getMissingUsersForMatch(sb, matchId, userIds);

    const isUrgent = Number.isFinite(remainMs) ? remainMs <= HOURS_24_MS : true;
    const hasMissing = missing.size > 0;

    // умная отправка: если не срочно и все уже поставили — пропускаем
    if (!isUrgent && !hasMissing) {
      return NextResponse.json({ ok: true, skipped: true, reason: "not_urgent_and_all_done" });
    }

    const title =
      `⚽ <b>Напоминание</b>\n` +
      `Проверьте прогнозы на ближайшие матчи.`;

    const matchBlock =
      `\n\n<b>Ближайший матч:</b>\n` +
      `${escapeHtml(home)} — ${escapeHtml(away)}\n` +
      `Начало: <b>${escapeHtml(fmtRuDateTime(kickoffAt))}</b>\n` +
      `Дедлайн: <b>${escapeHtml(fmtRuDateTime(deadlineAt))}</b>`;

    const remainLine = Number.isFinite(remainMs)
      ? `\nДо дедлайна: <b>${escapeHtml(fmtRemain(remainMs))}</b>`
      : "";

    const MAX_NAMES = 12;
    const missingNames = Array.from(missing)
      .map((uid) => nameById.get(uid) ?? uid.slice(0, 8))
      .slice(0, MAX_NAMES);

    const missingBlock = hasMissing
      ? `\n\n<b>Не поставили прогноз:</b>\n` +
        `${missingNames.map((n) => `• ${escapeHtml(n)}`).join("\n")}` +
        (missing.size > MAX_NAMES ? `\n…и ещё ${missing.size - MAX_NAMES}` : "")
      : `\n\n✅ <b>Все участники уже поставили прогноз</b>`;

    const footer = `\n\nОткрыть: ${escapeHtml(dashUrl)}`;

    const text = `${title}${matchBlock}${remainLine}${missingBlock}${footer}`;

    const matchUrl = `${site}/match/${matchId}`;

    await tgSendMessage({
      text,
      buttonUrl: dashUrl,
      buttonText: "Открыть дашборд",
      extraButtonUrl: matchUrl,
      extraButtonText: "Открыть матч",
    });

    return NextResponse.json({
      ok: true,
      match_id: matchId,
      missing_count: missing.size,
      urgent: isUrgent,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "broadcast_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}