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

/**
 * Берём матчи ближайших 26 часов (чтобы надёжно поймать окно 24ч)
 * Можно увеличить до 30ч если хочешь.
 */
async function getUpcomingMatches(sb: ReturnType<typeof service>, stageId: number | null) {
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const horizonIso = new Date(now + 26 * 60 * 60 * 1000).toISOString();

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
    // если у тебя статусы другие — добавь сюда нужные:
    .in("status", ["scheduled", "created", "open"])
    .order("kickoff_at", { ascending: true })
    .limit(50);

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
 * - нет строки в predictions
 * - или home_pred/away_pred = null
 */
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

// cron каждые 10 минут => окно +/- 10 минут
const WINDOW_MINUTES = 10;
const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

const BUCKETS = [
  { key: "24h", minutes: 24 * 60 },
  { key: "12h", minutes: 12 * 60 },
  { key: "1h", minutes: 60 },
  { key: "15m", minutes: 15 },
] as const;

type Bucket = (typeof BUCKETS)[number];

function pickBucket(msToKickoff: number): Bucket | null {
  for (const b of BUCKETS) {
    const target = b.minutes * 60 * 1000;
    if (Math.abs(msToKickoff - target) <= WINDOW_MS) return b;
  }
  return null;
}

function bucketLabel(b: Bucket): string {
  return b.minutes >= 60 ? `${Math.round(b.minutes / 60)}ч` : `${b.minutes}м`;
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

/* ---------------- debug ---------------- */

type DebugStats = {
  horizonMatches: number;
  processed: number;
  skipped_no_kickoff: number;
  skipped_already_started: number;
  skipped_no_bucket: number;
  skipped_no_missing: number;
  skipped_duplicate: number;
  skipped_send_limit: number;
  sent: number;
  buckets_hit: Record<string, number>;
  skips: Array<{ match_id: number | null; reason: string }>;
};

function initStats(): DebugStats {
  return {
    horizonMatches: 0,
    processed: 0,
    skipped_no_kickoff: 0,
    skipped_already_started: 0,
    skipped_no_bucket: 0,
    skipped_no_missing: 0,
    skipped_duplicate: 0,
    skipped_send_limit: 0,
    sent: 0,
    buckets_hit: {},
    skips: [],
  };
}

function bumpBucket(stats: DebugStats, key: string) {
  stats.buckets_hit[key] = (stats.buckets_hit[key] ?? 0) + 1;
}

function addSkip(stats: DebugStats, matchId: number | null, reason: string) {
  // чтобы не раздувать ответ
  if (stats.skips.length >= 30) return;
  stats.skips.push({ match_id: matchId, reason });
}

/* ---------------- handler ---------------- */

export async function POST(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const secret = mustEnv("CRON_SECRET");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const debug = req.headers.get("x-debug") === "1";
  const stats = initStats();

  try {
    const sb = service();
    const site = getSiteUrl();
    const entryUrl = `${site}/`;

    const stageId = await getCurrentStageId(sb);
    const matches = await getUpcomingMatches(sb, stageId);

    stats.horizonMatches = matches.length;

    if (debug) {
      console.log("[cron:broadcast] stageId=", stageId, "matchesInHorizon=", matches.length);
    }

    if (matches.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_matches_in_horizon",
        ...(debug ? { stats } : {}),
      });
    }

    const { userIds, nameById } = await getParticipants(sb);

    let sent = 0;
    const sentItems: Array<{ match_id: number; bucket: string; missing: number }> = [];

    // чтобы не спамить, ограничим максимум 3 сообщений за 1 запуск
    const MAX_SEND_PER_RUN = 3;

    for (const m of matches) {
      if (sent >= MAX_SEND_PER_RUN) {
        stats.skipped_send_limit++;
        addSkip(stats, Number((m as any).id ?? 0) || null, "send_limit");
        break;
      }

      stats.processed++;

      const matchId = Number((m as any).id);
      const kickoffAt = String((m as any).kickoff_at ?? "");
      if (!matchId || !kickoffAt) {
        stats.skipped_no_kickoff++;
        addSkip(stats, matchId || null, "no_kickoff");
        continue;
      }

      const kickoffMs = new Date(kickoffAt).getTime();
      const msToKickoff = kickoffMs - Date.now();

      if (!Number.isFinite(msToKickoff) || msToKickoff <= 0) {
        stats.skipped_already_started++;
        addSkip(stats, matchId, "already_started");
        continue;
      }

      const bucket = pickBucket(msToKickoff);
      if (!bucket) {
        stats.skipped_no_bucket++;
        addSkip(stats, matchId, "no_bucket");
        continue;
      }
      bumpBucket(stats, bucket.key);

      // кто без прогноза
      const missing = await getMissingUsersForMatch(sb, matchId, userIds);
      if (missing.size === 0) {
        stats.skipped_no_missing++;
        addSkip(stats, matchId, "no_missing_users");
        continue;
      }

      // анти-дубли (один матч + один bucket)
      const shouldSend = await tryLogSend(sb, matchId, bucket.key);
      if (!shouldSend) {
        stats.skipped_duplicate++;
        addSkip(stats, matchId, "duplicate");
        continue;
      }

      const home = teamName((m as any).home_team);
      const away = teamName((m as any).away_team);

      const MAX_NAMES = 12;
      const missingNames = Array.from(missing)
        .map((uid) => nameById.get(uid) ?? uid.slice(0, 8))
        .slice(0, MAX_NAMES);

      const title =
        `⚽ <b>Напоминание за ${escapeHtml(bucketLabel(bucket))}</b>\n` +
        `Пора внести прогноз.`;

      const matchBlock =
        `\n\n<b>Матч:</b>\n` +
        `${escapeHtml(home)} — ${escapeHtml(away)}\n` +
        `Начало (МСК): <b>${escapeHtml(fmtRuDateTime(kickoffAt))}</b>\n` +
        `До начала: <b>${escapeHtml(fmtRemain(msToKickoff))}</b>`;

      const missingBlock =
        `\n\n<b>Нет прогноза у:</b>\n` +
        `${missingNames.map((n) => `• ${escapeHtml(n)}`).join("\n")}` +
        (missing.size > MAX_NAMES ? `\n…и ещё ${missing.size - MAX_NAMES}` : "");

      const text = `${title}${matchBlock}${missingBlock}`;

      if (debug) {
        console.log("[cron:broadcast] send", {
          matchId,
          bucket: bucket.key,
          msToKickoff,
          missing: missing.size,
          kickoffAt,
        });
      }

      await tgSendMessage({
        text,
        buttonUrl: entryUrl,
        buttonText: "Перейти на сайт для внесения прогноза",
      });

      sent++;
      stats.sent++;
      sentItems.push({ match_id: matchId, bucket: bucket.key, missing: missing.size });
    }

    if (sent === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "nothing_to_send",
        ...(debug ? { stats } : {}),
      });
    }

    return NextResponse.json({
      ok: true,
      sent,
      items: sentItems,
      ...(debug ? { stats } : {}),
    });
  } catch (e: any) {
    if (debug) {
      console.error("[cron:broadcast] error", e);
    }
    return NextResponse.json(
      { ok: false, error: "broadcast_failed", message: String(e?.message ?? e), ...(debug ? { stats } : {}) },
      { status: 500 }
    );
  }
}