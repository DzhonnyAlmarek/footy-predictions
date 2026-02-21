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

/* ---------------- helpers ---------------- */

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
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;

  if (h <= 0) return `${m}м`;
  return `${h}ч ${m}м`;
}

type TeamObj = { name: string } | { name: string }[] | null;

function teamName(t: TeamObj): string {
  if (!t) return "?";
  const anyT: any = t as any;
  if (Array.isArray(anyT)) return String(anyT?.[0]?.name ?? "?");
  return String(anyT?.name ?? "?");
}

/* ---------------- telegram ---------------- */

async function tgSendMessage(params: { text: string; buttonUrl: string; buttonText: string }) {
  const token = mustEnv("TELEGRAM_BOT_TOKEN");
  const chatId = mustEnv("TELEGRAM_CHAT_ID");
  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: params.text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      reply_markup: {
        inline_keyboard: [[{ text: params.buttonText, url: params.buttonUrl }]],
      },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) {
    throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
  }
}

/* ---------------- data ---------------- */

async function getNearestMatch(sb: ReturnType<typeof service>) {
  const nowIso = new Date().toISOString();

  const { data: stage } = await sb
    .from("stages")
    .select("id")
    .eq("is_current", true)
    .maybeSingle();

  let q = sb
    .from("matches")
    .select(
      `
      id,
      stage_id,
      kickoff_at,
      status,
      stage_match_no,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .gt("kickoff_at", nowIso)
    .order("kickoff_at", { ascending: true })
    .limit(1);

  if (stage?.id) q = q.eq("stage_id", Number(stage.id));

  const { data, error } = await q;
  if (error) throw new Error(`nearest_match_failed: ${error.message}`);

  return (data ?? [])[0] ?? null;
}

async function getParticipants(sb: ReturnType<typeof service>) {
  const { data: accounts, error } = await sb
    .from("login_accounts")
    .select("user_id,login")
    .not("user_id", "is", null);

  if (error) throw new Error(`accounts_failed: ${error.message}`);

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

async function getMissingUsersForMatch(
  sb: ReturnType<typeof service>,
  matchId: number,
  userIds: string[]
): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();

  const { data: preds, error } = await sb
    .from("predictions")
    .select("user_id,home_pred,away_pred")
    .eq("match_id", matchId)
    .in("user_id", userIds);

  if (error) throw new Error(`predictions_failed: ${error.message}`);

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

/* ---------------- bucket logic ---------------- */

const BUCKETS = [
  { key: "24h", hours: 24 },
  { key: "12h", hours: 12 },
  { key: "1h", hours: 1 },
] as const;

const WINDOW_MINUTES = 10;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

function pickBucket(msToKickoff: number): (typeof BUCKETS)[number] | null {
  for (const b of BUCKETS) {
    const target = b.hours * 60 * 60 * 1000;
    if (Math.abs(msToKickoff - target) <= WINDOW_MS) return b;
  }
  return null;
}

async function tryLogSend(sb: ReturnType<typeof service>, matchId: number, bucketKey: string) {
  const { error } = await sb
    .from("telegram_broadcast_log")
    .insert({ match_id: matchId, bucket: bucketKey });

  if (!error) return true;

  const msg = String((error as any).message ?? "");
  const low = msg.toLowerCase();
  if (low.includes("duplicate") || low.includes("unique")) return false;

  throw new Error(`log_failed: ${msg}`);
}

/* ---------------- handler ---------------- */

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = mustEnv("CRON_SECRET");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const sb = service();
    const site = getSiteUrl();
    const entryUrl = `${site}/`;

    const match = await getNearestMatch(sb);
    if (!match?.id || !match?.kickoff_at) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_upcoming_matches" });
    }

    const matchId = Number(match.id);
    const kickoffAt = String(match.kickoff_at);
    const kickoffMs = new Date(kickoffAt).getTime();
    const nowMs = Date.now();
    const msToKickoff = kickoffMs - nowMs;

    if (!Number.isFinite(msToKickoff) || msToKickoff <= 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "match_started" });
    }

    const bucketPicked = pickBucket(msToKickoff);
    if (!bucketPicked) {
      return NextResponse.json({ ok: true, skipped: true, reason: "outside_windows" });
    }

    // ✅ фикс TS: сохраняем сразу после null-check
    const bucketKey = bucketPicked.key;
    const bucketHours = bucketPicked.hours;

    const { userIds, nameById } = await getParticipants(sb);
    const missing = await getMissingUsersForMatch(sb, matchId, userIds);

    if (missing.size === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_missing_users",
        bucket: bucketKey,
      });
    }

    const shouldSend = await tryLogSend(sb, matchId, bucketKey);
    if (!shouldSend) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "already_sent",
        bucket: bucketKey,
      });
    }

    const home = teamName(match.home_team);
    const away = teamName(match.away_team);

    const MAX_NAMES = 12;
    const missingNames = Array.from(missing)
      .map((uid) => nameById.get(uid) ?? uid.slice(0, 8))
      .slice(0, MAX_NAMES);

    const title = `⚽ <b>Напоминание за ${bucketHours}ч</b>\nПора внести прогноз.`;

    const matchBlock =
      `\n\n<b>Ближайший матч:</b>\n` +
      `${escapeHtml(home)} — ${escapeHtml(away)}\n` +
      `Начало: <b>${escapeHtml(fmtRuDateTime(kickoffAt))}</b>\n` +
      `До начала: <b>${escapeHtml(fmtRemain(msToKickoff))}</b>`;

    const missingBlock =
      `\n\n<b>Нет прогноза у:</b>\n` +
      `${missingNames.map((n) => `• ${escapeHtml(n)}`).join("\n")}` +
      (missing.size > MAX_NAMES ? `\n…и ещё ${missing.size - MAX_NAMES}` : "");

    const footer = `\n\nПерейти на сайт: ${escapeHtml(entryUrl)}`;

    const text = `${title}${matchBlock}${missingBlock}${footer}`;

    await tgSendMessage({
      text,
      buttonUrl: entryUrl,
      buttonText: "Перейти на сайт для внесения прогноза",
    });

    return NextResponse.json({
      ok: true,
      bucket: bucketKey,
      match_id: matchId,
      missing_count: missing.size,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "broadcast_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}