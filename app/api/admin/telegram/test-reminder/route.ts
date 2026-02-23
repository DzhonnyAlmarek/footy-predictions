import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function getSiteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "https://footy-predictions.vercel.app";
}

const TZ = "Europe/Moscow";
const CUTOFF_MS = 60_000;

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

type TeamObj = { name: string } | { name: string }[] | null;
function teamName(t: TeamObj): string {
  if (!t) return "?";
  const anyT: any = t as any;
  if (Array.isArray(anyT)) return String(anyT?.[0]?.name ?? "?");
  return String(anyT?.name ?? "?");
}

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
      reply_markup: { inline_keyboard: [[{ text: params.buttonText, url: params.buttonUrl }]] },
    }),
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json?.ok) throw new Error(`Telegram send failed: ${JSON.stringify(json)}`);
}

async function assertAdmin() {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const login = decodeMaybe(rawLogin).trim().toUpperCase();
  if (login !== "ADMIN") {
    return false;
  }
  return true;
}

async function getCurrentStageId(sb: ReturnType<typeof service>): Promise<number | null> {
  const { data, error } = await sb.from("stages").select("id").eq("is_current", true).maybeSingle();
  if (error) throw new Error(`stage_failed: ${error.message}`);
  return data?.id != null ? Number(data.id) : null;
}

async function listMatches(sb: ReturnType<typeof service>, stageId: number | null) {
  const now = Date.now();
  const horizonIso = new Date(now + 72 * 60 * 60 * 1000).toISOString(); // 3 дня для теста
  let q = sb
    .from("matches")
    .select(
      `
      id,
      kickoff_at,
      status,
      home_team:teams!matches_home_team_id_fkey ( name ),
      away_team:teams!matches_away_team_id_fkey ( name )
    `
    )
    .lte("kickoff_at", horizonIso)
    .order("kickoff_at", { ascending: true })
    .limit(100);
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

function buildPreviewText(params: {
  bucket: "24h" | "12h" | "1h" | "15m";
  kickoffAt: string;
  home: string;
  away: string;
  missingNames: string[];
  missingTotal: number;
}) {
  const label =
    params.bucket === "15m"
      ? "за 15 минут"
      : `за ${params.bucket.replace("h", "")} час(а)`;

  const title = `⚽ <b>ТЕСТ: Напоминание (${escapeHtml(label)})</b>\nПора внести прогноз.`;

  const kickoffMs = new Date(params.kickoffAt).getTime();
  const msToKickoff = kickoffMs - Date.now();
  const minsToCutoff = Math.max(0, Math.floor((msToKickoff - CUTOFF_MS) / 60000));

  const matchBlock =
    `\n\n<b>Матч:</b>\n` +
    `${escapeHtml(params.home)} — ${escapeHtml(params.away)}\n` +
    `Начало (МСК): <b>${escapeHtml(fmtRuDateTime(params.kickoffAt))}</b>\n` +
    `До дедлайна: <b>${minsToCutoff}м</b>`;

  const MAX_NAMES = 12;
  const names = params.missingNames.slice(0, MAX_NAMES);

  const missingBlock =
    `\n\n<b>Нет прогноза у:</b>\n` +
    `${names.map((n) => `• ${escapeHtml(n)}`).join("\n")}` +
    (params.missingTotal > MAX_NAMES ? `\n…и ещё ${params.missingTotal - MAX_NAMES}` : "");

  return `${title}${matchBlock}${missingBlock}`;
}

/* -------- GET: список матчей для селекта -------- */

export async function GET() {
  const okAdmin = await assertAdmin();
  if (!okAdmin) return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });

  try {
    const sb = service();
    const stageId = await getCurrentStageId(sb);
    const list = await listMatches(sb, stageId);

    const matches = list
      .filter((m: any) => m?.id && m?.kickoff_at)
      .map((m: any) => ({
        id: Number(m.id),
        kickoff_at: fmtRuDateTime(String(m.kickoff_at)),
        home: teamName(m.home_team),
        away: teamName(m.away_team),
        status: String(m.status ?? ""),
      }));

    return NextResponse.json({ ok: true, matches });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "list_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

/* -------- POST: preview или отправка -------- */

export async function POST(req: Request) {
  const okAdmin = await assertAdmin();
  if (!okAdmin) return NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 });

  try {
    const body = (await req.json().catch(() => ({}))) as {
      matchId?: number | null;
      bucket?: "24h" | "12h" | "1h" | "15m";
      dryRun?: boolean;
      includeEvenIfNoMissing?: boolean;
    };

    const bucket = body.bucket ?? "15m";
    const dryRun = body.dryRun !== false; // default true
    const includeEvenIfNoMissing = body.includeEvenIfNoMissing === true;

    const sb = service();
    const site = getSiteUrl();
    const entryUrl = `${site}/`;

    const stageId = await getCurrentStageId(sb);
    const list = await listMatches(sb, stageId);

    const pick =
      body.matchId != null
        ? list.find((m: any) => Number(m.id) === Number(body.matchId))
        : list.find((m: any) => m?.kickoff_at);

    if (!pick?.id) {
      return NextResponse.json({ ok: false, error: "no_match" }, { status: 400 });
    }

    const matchId = Number((pick as any).id);
    const kickoffAt = String((pick as any).kickoff_at ?? "");
    const home = teamName((pick as any).home_team);
    const away = teamName((pick as any).away_team);

    const { userIds, nameById } = await getParticipants(sb);
    const missing = await getMissingUsersForMatch(sb, matchId, userIds);
    const missingNames = Array.from(missing).map((uid) => nameById.get(uid) ?? uid.slice(0, 8));

    const preview = buildPreviewText({
      bucket,
      kickoffAt,
      home,
      away,
      missingNames,
      missingTotal: missing.size,
    });

    const skipped = missing.size === 0 && !includeEvenIfNoMissing;

    if (!dryRun && !skipped) {
      await tgSendMessage({
        text: preview,
        buttonUrl: entryUrl,
        buttonText: "Перейти на сайт",
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      skipped: skipped ? true : undefined,
      reason: skipped ? "no_missing" : undefined,
      match: { id: matchId, kickoff_at: fmtRuDateTime(kickoffAt), home, away },
      missing: { total: missing.size, names: missingNames.slice(0, 12) },
      preview,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "test_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}