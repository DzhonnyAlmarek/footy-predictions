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

const TZ = "Europe/Moscow";

// дедлайн: kickoff - 1 мин
const CUTOFF_MS = 60_000;

// горизонт: чтобы поймать 24ч окно
const HORIZON_HOURS = 26;

// cron частота: под неё “окно”
// если cron каждые 5 минут — оставь 6..7 мин, чтобы не промахнуться
const WINDOW_MINUTES = 10;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

const BUCKETS = [
  { key: "24h", ms: 24 * 60 * 60 * 1000 },
  { key: "12h", ms: 12 * 60 * 60 * 1000 },
  { key: "1h", ms: 1 * 60 * 60 * 1000 },
  { key: "15m", ms: 15 * 60 * 1000 },
] as const;

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
    timeZone: TZ,
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

async function getCurrentStageId(sb: ReturnType<typeof service>): Promise<number | null> {
  const { data, error } = await sb.from("stages").select("id").eq("is_current", true).maybeSingle();
  if (error) throw new Error(`stage_failed: ${error.message}`);
  return data?.id != null ? Number(data.id) : null;
}

async function getUpcomingMatches(sb: ReturnType<typeof service>, stageId: number | null) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const horizonIso = new Date(now + HORIZON_HOURS * 60 * 60 * 1000).toISOString();

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
    .gte("kickoff_at", nowIso)
    .lte("kickoff_at", horizonIso)
    .in("status", ["scheduled", "created", "open"])
    .order("kickoff_at", { ascending: true })
    .limit(80);

  if (stageId != null) q = q.eq("stage_id", stageId);

  const { data, error } = await q;
  if (error) throw new Error(`matches_failed: ${error.message}`);
  return data ?? [];
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

  const userIds = Array.from(new Set(real.map((a: any) => String(a.user_id)).filter(Boolean)));

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

function pickBucket(msToKickoff: number): (typeof BUCKETS)[number] | null {
  for (const b of BUCKETS) {
    if (Math.abs(msToKickoff - b.ms) <= WINDOW_MS) return b;
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

function buildText(params: {
  bucketLabel: string;
  kickoffAt: string;
  home: string;
  away: string;
  msToKickoff: number;
  missingNames: string[];
  missingTotal: number;
}) {
  const MAX_NAMES = 12;
  const names = params.missingNames.slice(0, MAX_NAMES);

  const title = `⚽ <b>Напоминание (${escapeHtml(params.bucketLabel)})</b>\nПора внести прогноз.`;

  const matchBlock =
    `\n\n<b>Матч:</b>\n` +
    `${escapeHtml(params.home)} — ${escapeHtml(params.away)}\n` +
    `Начало (МСК): <b>${escapeHtml(fmtRuDateTime(params.kickoffAt))}</b>\n` +
    `До дедлайна: <b>${escapeHtml(fmtRemain(params.msToKickoff - CUTOFF_MS))}</b>`;

  const missingBlock =
    `\n\n<b>Нет прогноза у:</b>\n` +
    `${names.map((n) => `• ${escapeHtml(n)}`).join("\n")}` +
    (params.missingTotal > MAX_NAMES ? `\n…и ещё ${params.missingTotal - MAX_NAMES}` : "");

  return `${title}${matchBlock}${missingBlock}`;
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

    const stageId = await getCurrentStageId(sb);
    const matches = await getUpcomingMatches(sb, stageId);

    if (matches.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_matches_in_horizon" });
    }

    const { userIds, nameById } = await getParticipants(sb);

    let sent = 0;
    const items: Array<{ match_id: number; bucket: string; missing: number }> = [];

    const MAX_SEND_PER_RUN = 5;

    for (const m of matches) {
      if (sent >= MAX_SEND_PER_RUN) break;

      const matchId = Number((m as any).id);
      const kickoffAt = String((m as any).kickoff_at ?? "");
      if (!matchId || !kickoffAt) continue;

      const kickoffMs = new Date(kickoffAt).getTime();
      const msToKickoff = kickoffMs - Date.now();

      // матч уже начался или слишком близко: после kickoff-1m НЕ шлём
      if (!Number.isFinite(msToKickoff) || msToKickoff <= CUTOFF_MS) continue;

      const bucket = pickBucket(msToKickoff);
      if (!bucket) continue;

      const missing = await getMissingUsersForMatch(sb, matchId, userIds);
      if (missing.size === 0) continue;

      const shouldSend = await tryLogSend(sb, matchId, bucket.key);
      if (!shouldSend) continue;

      const home = teamName((m as any).home_team);
      const away = teamName((m as any).away_team);

      const missingNames = Array.from(missing).map((uid) => nameById.get(uid) ?? uid.slice(0, 8));

      const text = buildText({
        bucketLabel: bucket.key === "15m" ? "за 15 минут" : `за ${bucket.key.replace("h", "")} час(а)`,
        kickoffAt,
        home,
        away,
        msToKickoff,
        missingNames,
        missingTotal: missing.size,
      });

      await tgSendMessage({
        text,
        buttonUrl: entryUrl,
        buttonText: "Перейти на сайт",
      });

      sent++;
      items.push({ match_id: matchId, bucket: bucket.key, missing: missing.size });
    }

    if (sent === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "nothing_to_send" });
    }

    return NextResponse.json({ ok: true, sent, items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "broadcast_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}