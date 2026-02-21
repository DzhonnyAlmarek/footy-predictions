import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TZ_MSK = "Europe/Moscow";

/* ---------------- basics ---------------- */

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

function decodeMaybe(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

async function requireAdminCookie(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const cs = await cookies();
  const rawLogin = cs.get("fp_login")?.value ?? "";
  const fpLogin = decodeMaybe(rawLogin).trim().toUpperCase();

  if (fpLogin !== "ADMIN") {
    return {
      ok: false,
      res: NextResponse.json({ ok: false, error: "admin_only" }, { status: 403 }),
    };
  }
  return { ok: true };
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

function fmtRuDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", { timeZone: TZ_MSK, dateStyle: "medium" });
}

function fmtRuTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { timeZone: TZ_MSK, hour: "2-digit", minute: "2-digit" });
}

function fmtRuDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("ru-RU", {
    timeZone: TZ_MSK,
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

function addMinutes(iso: string, minutes: number): string {
  const d = new Date(iso);
  return new Date(d.getTime() + minutes * 60_000).toISOString();
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

async function getUpcomingMatches(sb: ReturnType<typeof service>, stageId: number | null, limit = 20) {
  const nowIso = new Date().toISOString();
  const horizonIso = addMinutes(nowIso, 26 * 60); // 26h

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
    .limit(limit);

  if (stageId != null) q = q.eq("stage_id", stageId);

  const { data, error } = await q;
  if (error) throw new Error(`matches_failed: ${error.message}`);
  return (data ?? []) as any[];
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

/* ---------------- message builder ---------------- */

function bucketLabel(bucket: "24h" | "12h" | "1h" | "15m"): string {
  if (bucket === "24h") return "24ч";
  if (bucket === "12h") return "12ч";
  if (bucket === "1h") return "1ч";
  return "15м";
}

function buildReminderText(params: {
  bucket: "24h" | "12h" | "1h" | "15m";
  kickoffAt: string;
  home: string;
  away: string;
  missingNames: string[];
  missingTotal: number;
}) {
  const kickoffMs = new Date(params.kickoffAt).getTime();
  const msToKickoff = kickoffMs - Date.now();

  const deadlineIso = new Date(kickoffMs - 60_000).toISOString(); // kickoff - 1m
  const msToDeadline = new Date(deadlineIso).getTime() - Date.now();

  const title =
    `🧪 <b>Тестовое напоминание за ${escapeHtml(bucketLabel(params.bucket))}</b>\n` +
    `Пора внести прогноз.`;

  const matchBlock =
    `\n\n<b>Матч:</b>\n` +
    `${escapeHtml(params.home)} — ${escapeHtml(params.away)}\n` +
    `Дата (МСК): <b>${escapeHtml(fmtRuDate(params.kickoffAt))}</b>\n` +
    `Время (МСК): <b>${escapeHtml(fmtRuTime(params.kickoffAt))}</b>\n` +
    `До начала: <b>${escapeHtml(fmtRemain(msToKickoff))}</b>\n` +
    `Дедлайн (начало − 1м): <b>${escapeHtml(fmtRuDateTime(deadlineIso))}</b>\n` +
    `До дедлайна: <b>${escapeHtml(fmtRemain(msToDeadline))}</b>`;

  const missingBlock =
    params.missingTotal === 0
      ? `\n\n✅ <b>Все участники уже внесли прогноз.</b>`
      : `\n\n<b>Нет прогноза у:</b>\n` +
        `${params.missingNames.map((n) => `• ${escapeHtml(n)}`).join("\n")}` +
        (params.missingTotal > params.missingNames.length
          ? `\n…и ещё ${params.missingTotal - params.missingNames.length}`
          : "");

  return `${title}${matchBlock}${missingBlock}`;
}

/* ---------------- handler ---------------- */

export async function GET() {
  const adm = await requireAdminCookie();
  if (!adm.ok) return adm.res;

  try {
    const sb = service();
    const stageId = await getCurrentStageId(sb);
    const matches = await getUpcomingMatches(sb, stageId, 30);

    const items = matches.map((m) => ({
      id: Number(m.id),
      kickoff_at: String(m.kickoff_at ?? ""),
      home: teamName(m.home_team),
      away: teamName(m.away_team),
      status: String(m.status ?? ""),
    }));

    return NextResponse.json({ ok: true, matches: items });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "list_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const adm = await requireAdminCookie();
  if (!adm.ok) return adm.res;

  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const bucket = (String(body.bucket ?? "15m") as any) as "24h" | "12h" | "1h" | "15m";
    const dryRun = Boolean(body.dryRun);
    const includeEvenIfNoMissing = body.includeEvenIfNoMissing !== false; // default true

    const sb = service();
    const site = getSiteUrl();
    const entryUrl = `${site}/`;

    const stageId = await getCurrentStageId(sb);
    const matches = await getUpcomingMatches(sb, stageId, 50);
    if (matches.length === 0) {
      return NextResponse.json({ ok: false, error: "no_upcoming_matches" }, { status: 400 });
    }

    let chosen: any | null = null;

    const matchIdFromBody = body.matchId != null ? Number(body.matchId) : null;
    if (matchIdFromBody) {
      chosen = matches.find((m) => Number(m.id) === matchIdFromBody) ?? null;
      if (!chosen) {
        return NextResponse.json({ ok: false, error: "match_not_found_in_horizon" }, { status: 400 });
      }
    } else {
      chosen = matches[0]; // ближайший
    }

    const matchId = Number(chosen.id);
    const kickoffAt = String(chosen.kickoff_at ?? "");
    if (!matchId || !kickoffAt) {
      return NextResponse.json({ ok: false, error: "match_missing_kickoff" }, { status: 400 });
    }

    const { userIds, nameById } = await getParticipants(sb);
    const missing = await getMissingUsersForMatch(sb, matchId, userIds);

    const MAX_NAMES = 20;
    const missingNames = Array.from(missing)
      .map((uid) => nameById.get(uid) ?? uid.slice(0, 8))
      .slice(0, MAX_NAMES);

    const home = teamName(chosen.home_team);
    const away = teamName(chosen.away_team);

    const text = buildReminderText({
      bucket,
      kickoffAt,
      home,
      away,
      missingNames,
      missingTotal: missing.size,
    });

    if (!includeEvenIfNoMissing && missing.size === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_missing_users",
        preview: text,
        match: { id: matchId, kickoff_at: kickoffAt, home, away },
      });
    }

    if (!dryRun) {
      await tgSendMessage({
        text,
        buttonUrl: entryUrl,
        buttonText: "Перейти на сайт для внесения прогноза",
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      match: { id: matchId, kickoff_at: kickoffAt, home, away },
      missing: { total: missing.size, names: missingNames },
      preview: text,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: "test_failed", message: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}